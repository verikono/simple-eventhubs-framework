import { v4 as uuid } from 'uuid';
import { EventEmitter } from 'events';

import { logger } from './logger';
import {
    EventHubConsumerClient,
    EventHubProducerClient
} from '@azure/event-hubs';

import { onResolvedProp } from './util';

import * as I from './types';
import * as C from './const';

export class EventHubEngine extends EventEmitter {

    subscriptions:Array<I.ConsumerSubscription> = [];
    producers:Array<I.ProducerClient> = [];
    config:I.EventHubEngineConfig = null;

    constructor( props:I.EventHubEngineProps={} ) {

        super();

        props.config = props.config || {};
        this.setConfiguration(props.config);
        if(props.hasOwnProperty('listeners') && props.listeners.length)
            this.initializeListeners(props.listeners);
    }

    connect() {

    }

    public initializeListeners( listeners:Array<any> ) {

        try {

            Promise.all(listeners.map(ln => {
                
                const {
                    hub,
                    topic,
                    listener
                } = ln;
                
                return this.subscribe({hub, topic, listener})
            }))
            .then( result => {
                this.emit('ready');
            })
        }
        catch( err ) {
            console.log('<<-->>')
        }
    }

    /**
     * Invoke a listener over the eventhub
     * 
     * @param props the argument object
     * @param props.hub the hub to communicate over, default: instance.config.AZURE_DEFAULT_EVENTHUB.
     * @param topic the topic for this communication
     * @param payload Object key/value object as arguments to the listener
     * @param callback Function a function to fire upon response. !!important: if a callback is provided invoke will on longer await a response and continue execution
     * @param include_cid Boolean attach the cid into the message payload
     */
    public async invoke( props:I.invokeProps=C.invokeDefaultProps ):Promise<any> {

        try {

            //destructure
            const {
                topic,
                payload,
                callback,
                include_cid
            } = props;

            const hub = props.hub || this.config.AZURE_DEFAULT_EVENTHUB;
            if(!hub)
                throw `Could not resolve an eventhub to invoke upon`;

            return new Promise( async (resolve, reject) => {

                const cid = uuid();
                if(include_cid)
                    payload['cid'] = cid;

                //get the outbound subscription, attaching a cid/onetime listener
                await this.getConsumerSubscription({
                    hub,
                    topic,
                    direction: 'outbound',
                    isReplyConsumer: true,
                    cid,
                    listener: async msg => { 
                        if(typeof callback === 'function') {
                            await callback(msg);
                        }
                        else
                            resolve(msg)
                    }
                });

                //hack until we can ensure the queues are actually running...
                await new Promise((r) => {
                    setTimeout(_=>r(true), 1000)
                });

                //gain a producer to message down the hub.
                const producer = this.getProducer({hub, direction: 'inbound'});

                //spin up a batch, and send it down the hub.
                const batch = await producer.client.createBatch();
                batch.tryAdd({body: {cid, topic, payload}});
                await producer.client.sendBatch(batch);

                logger.info(`Dispatched message to ${hub}-inbound:${topic}`);

                if(typeof callback === 'function')
                    resolve(true);
            });
        }
        catch( err ) {

            throw `EventHubEngine::invoke has failed - ${err}`;
        }

    }

    public async subscribe( props:I.ElistenProps=C.listenDefaultProps ) {

        try {

            //destructure
            const {
                topic,
                listener
            } = props;

            const hub = props.hub || this.config.AZURE_DEFAULT_EVENTHUB;
            if(!hub)
                throw `could not resolve eventhub for this communcation`;

            if(!topic)
                throw `invalid argument "topic"`;

            if(typeof listener !== 'function')
                throw `invalid argument "listener"`;

            const consumerSubscription = await this.getConsumerSubscription({hub, topic, direction: 'inbound'});
            consumerSubscription.listeners.push({topic, listener});
            logger.info(`Listener attached to topic: ${topic} on eventhub: ${hub}-inbound`);
        }
        catch( err ) {

            throw `EventHubEngine::listen has failed - ${err}`;
        }

    }

    /**
     * Unsubscribe listeners from the eventhub
     * 
     * with no arguments this will unsubscribe everything, if a topic is argued only listeners on that topic, and with direction only listeners with that direction. nb. providing only a direction will unsubscribe all topcis for the subscrived direction.
     * 
     * @param props the argument object
     * @param props.topic the topic being unsubscribed
     * @param props.direction the direction to unsubscribe from
     * 
     * @returns Promise<boolean>
     *  
     */
    public async unsubscribe( props:I.unsubscribeProps=C.unsubscribeDefaults ):Promise<boolean> {

        const {
            hub,
            direction
        } = props;

        const subscriptions = this.subscriptions.filter(subscription =>
            (subscription.hub === hub || hub === undefined) && 
            (subscription.direction === direction || direction === undefined)
        );

        const producers = this.producers.filter(producer => 
            (producer.hub === hub || hub === undefined) &&
            (producer.direction === direction || direction === undefined)
        );

        await Promise.all(subscriptions.map(subscription => subscription.consumer.close()));
        await Promise.all(producers.map(producer => producer.client.close()));

        this.subscriptions = this.subscriptions.filter(subscription => !subscriptions.includes(subscription));
        this.producers = this.producers.filter(producer => !producers.includes(producer));

        return true
    }

    /**
     * Get an event consumer client
     * 
     * @param props the property object
     * @param props.topic string the eventhub
     * @param props.direction string either 'inbound' or 'outbound'
     * @param props.consumerGroup string the consumer group, default: "$Default"
     * @param props.isInvocation boolean consumer will be used for 1 incovation only. (removes the listener once its been used)
     * @param props.listener Function
     * 
     * @returns
     */
    async getConsumerSubscription( props:I.EgetConsumerSubscriptionProps ):Promise<I.ConsumerSubscription> {

        try {

            //destructure props.
            const { direction } = props;
            let {
                hub,
                topic,
                consumerGroup,
                isReplyConsumer,
                cid,
                listener
            } = props;

            hub = hub || this.config['AZURE_DEFAULT_EVENTHUB'];
            if(!hub)
                throw `could not determine the eventhub to use either from an argument or the instance configuration`;
            
            if(direction !== 'inbound' && direction !== 'outbound')
                throw `invalid direction argued - provide as either inbound or outbound`;

            consumerGroup = consumerGroup || '$Default';

            //build the 
            const directionalHub = `${hub}-${direction}`;

            //do we have a subscription for this consumer already?
            const existingSubscription = this.subscriptions.find(subscription =>
                subscription.hub === hub && subscription.direction === direction
            );

            //we do, so return it, attaching a listener on it if we have one.
            if(existingSubscription) {
                logger.info(`Using existing subscription for ${directionalHub}`);

                //if we have a listener, lets attach it to this consumer.
                if(listener) {

                    const lst:I.ConsumerSubscriptionListener = isReplyConsumer
                        ? { topic, listener, cid, once: true }
                        : { topic, listener }
                    existingSubscription.listeners = existingSubscription.listeners.concat([lst])
    
                }

                return existingSubscription;
            }

            const consumer = new EventHubConsumerClient(
                consumerGroup,
                this.config['AZURE_EVENTHUB_CONNECTION_STRING'],
                directionalHub
            );

            //@ts-ignore - context to hoist in info
            const subscription = consumer.subscribe(
                {
                    /* @todo: introduce patterns which will determine the process events method , currently this is for RPC */
                    processEvents: async (events, context) => {

                        if(!events.length) return;

                        //gain the subscription for this topic and direction
                        const subscription = this.subscriptions.find(subscription =>
                            subscription.topic === topic && subscription.direction === direction);

                        //gain the reply hub.
                        const replyDirection = direction === 'inbound' ? 'outbound' : 'inbound';
                        const replyingProducer = this.getProducer({hub, direction: replyDirection});
                        const batch = await replyingProducer.client.createBatch();
                        let reply = false;

                        //for each event
                        for(const event of events) { 
                            
                            const {
                                cid,
                                topic,
                                payload,
                                result
                            } = event.body;
                            
                            //gain all listeners on this subscription, awaiting this event's topic
                            const listeners = subscription.listeners.filter(listener => listener.topic === topic);

                            //iterate through the listeners
                            await Promise.all( listeners.map( async listener => {

                                //if the listener has a cid, ignore this event if the cids dont match
                                if(!listener.cid || event.body.cid == listener.cid) {

                                    //this is ugly butttt.. if we received a result, we take this to mean, this is an RPC response event.
                                    //this RPC pattern should be turfed out to its own methods, its to much B.S. to leave in here -- #@todo.
                                    const rtrn = listener.listener(payload||result);

                                    //if we receieve a promise, await it.
                                    const response = rtrn instanceof Promise ? await rtrn : rtrn;

                                    //if this is a result, we're done in the chain of events, so blow the event listener off if its tagged for collection as it's been used.
                                    if(result && !payload) {
                                        if(listener.once)
                                            subscription.listeners = subscription.listeners.filter(slistener => slistener !== listener);
                                    }
                                    //if this is a payload, we want to respond to use the listener response as a reply event.
                                    else if(!result && payload) {
                                        batch.tryAdd({body: {cid, topic, result: response}});
                                        reply = true;
                                    }
                                    else
                                        throw `Invalid event receieved - ${JSON.stringify(event)}`;

                                }

                            }));

                            //update the queue's checkpoint marker as we've just processed the event.
                            await context.updateCheckpoint(event);
                        }

                        if(reply)
                            await replyingProducer.client.sendBatch(batch);

                    },
                    processError: async (err, context) => {
                        console.log(`Errored ${err}`);
                    }
                }
            );

            //wait to ensure the queue is actually running
            await onResolvedProp(subscription, 'isRunning')

            const consumerSubscription:I.ConsumerSubscription = {
                hub,
                topic,
                direction,
                subscription,
                consumer,
                type: 'consumer',
                listeners: []
            }

            if(listener) {
                consumerSubscription.listeners.push({
                    topic,
                    listener,
                    cid,
                    once: isReplyConsumer
                })
            }

            this.subscriptions.push(consumerSubscription);

            logger.info(`Built subscription for ${directionalHub}`)

            return consumerSubscription;

        }
        catch(err) {
            throw `EventHubEngine::getConsumerSubscription has failed - ${err}`;
        }
    }

    /**
     * Get an event producer client
     * 
     * @param props the argument object
     * @param props.hub string the eventhub/topic
     */
    getProducer( props:I.getProducerProps=C.getProducerDefaults) {

        try {

            //destrucute
            const {
                hub,
                direction
            } = props;

            //qualify arguments
            if(!hub)
                throw `missing argument "hub"`

            if(direction !== 'inbound' && direction !== 'outbound')
                throw 'invalid direction, argue either "inbound" or "outbound"'

            const existingProducer = this.producers.find(producer => 
                producer.hub === hub && producer.direction === direction
            );

            if(existingProducer)
                return existingProducer;

            const directionalHub = `${hub}-${direction}`;

            const client = new EventHubProducerClient(
                this.config['AZURE_EVENTHUB_CONNECTION_STRING'],
                directionalHub
            );

            const producer:I.ProducerClient = {
                hub,
                direction,
                client
            };
            this.producers.push(producer);

            return producer;

        }
        catch(err) {

            throw `EventHubEngine::getProducer has failed - ${err}`;
        }
    }

    /**
     * Gather a valid configuration for this running instance, applying environment variables (if available) for missing configuration items.
     * 
     * @param config
     * 
     * @returns void 
     */
    private setConfiguration( config:I.EventHubEngineConfig ) {

        try {

            config.AZURE_EVENTHUB_CONNECTION_STRING = config.AZURE_EVENTHUB_CONNECTION_STRING || process.env['AZURE_EVENTHUB_CONNECTION_STRING'];
            config.AZURE_EVENTHUB_NAMESPACE = config.AZURE_EVENTHUB_NAMESPACE || process.env['AZURE_EVENTHUB_NAMESPACE'];
            config.AZURE_DEFAULT_EVENTHUB = config.AZURE_DEFAULT_EVENTHUB || process.env['AZURE_DEFAULT_EVENTHUB'];

            if(typeof config.AZURE_EVENTHUB_CONNECTION_STRING !== 'string' || config.AZURE_EVENTHUB_CONNECTION_STRING.length < 1)
                throw `could not determine AZURE_EVENTHUB_CONNECTION_STRING`;

            if(typeof config.AZURE_EVENTHUB_NAMESPACE !== 'string' || config.AZURE_EVENTHUB_NAMESPACE.length < 1)
                throw `could not determine AZURE_EVENTHUB_NAMESPACE`;

            if(!config.AZURE_DEFAULT_EVENTHUB)
                logger.warn(`No default eventhub has been registered, all invocations and listeners must specify their eventhub namespace/hub`);

            this.config = config;

        }
        catch( err ) {

            throw `EventHubEngine::setConfiguration failed - ${err}`;
        }

    }

    public close() {
        this.subscriptions.forEach(subscription => subscription.subscription.close());
    }

}