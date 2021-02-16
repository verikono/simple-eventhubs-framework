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
     * 
     * @param props the argument object
     * @param topic the topic being invoked
     * @param payload Object key/value object as arguments to the listener
     */
    public async invoke( props:I.invokeProps=C.invokeDefaultProps ):Promise<any> {

        try {

            //destructure
            const {
                topic,
                payload
            } = props;

            return new Promise( async (resolve, reject) => {

                const cid = uuid();

                await this.getConsumerSubscription({
                    topic,
                    direction: 'outbound',
                    isInvocation:true,
                    cid,
                    listener: msg => resolve(msg)
                });

                //hack until we can ensure the queues are actually running...
                await new Promise((r) => {
                    setTimeout(_=>r(true), 1000)
                });

                const producer = this.getProducer({topic, direction: 'inbound'});
                const batch = await producer.client.createBatch();
                batch.tryAdd({body: {cid, payload}});
                await producer.client.sendBatch(batch);
                logger.info(`Dispatched message to ${topic}-inbound`);
                //await producer.close();
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
                hub,
                topic,
                listener
            } = props;

            if(!topic)
                throw `invalid argument "topic"`;

            if(typeof listener !== 'function')
                throw `invalid argument "listener"`;

            const consumerSubscription = await this.getConsumerSubscription({topic, direction: 'inbound'});
            consumerSubscription.listeners.push(listener);
            logger.info(`Listener attached to topic: ${topic}-inbound`);
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
            topic,
            direction
        } = props;

        const subscriptions = this.subscriptions.filter(subscription => 
            (subscription.topic === topic || topic === undefined ) && ( subscription.direction === direction || direction === undefined)
        );

        const producers = this.producers.filter(producer => 
            (producer.topic === topic || topic === undefined) && (producer.direction === direction || direction === undefined)
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
     */
    async getConsumerSubscription( props:I.EgetConsumerSubscriptionProps ):Promise<I.ConsumerSubscription> {

        try {

            //destructure props.
            const { direction } = props;
            let {
                hub,
                topic,
                consumerGroup,
                isInvocation,
                cid,
                listener
            } = props;

            hub = hub || this.config['AZURE_EVENTHUB_NAMESPACE'];
            if(!hub)
                throw `could not determine the eventhub to use either from an argument or the instance configuration`;

            //ensure props are sane
            if(!topic)
                throw `missing argument "topic"`            
            
            if(direction !== 'inbound' && direction !== 'outbound')
                throw `invalid direction argued - provide as either inbound or outbound`;


            consumerGroup = consumerGroup || '$Default';

            //mutate topic to the topic and its direction
            const directionalTopic = `${topic}-${direction}`;

            //do we have a subscription for this consumer already?
            const existingSubscription = this.subscriptions.find(subscription =>
                subscription.topic === topic && subscription.direction === direction
            );
            if(existingSubscription) {
                logger.info(`Using existing subscription for ${directionalTopic}`)
                return existingSubscription;
            }

            const consumer = new EventHubConsumerClient(
                consumerGroup,
                this.config['AZURE_EVENTHUB_CONNECTION_STRING'],
                directionalTopic
            );

            //@ts-ignore - context to hoist in info
            const subscription = consumer.subscribe(
                {
                    processEvents: async (events, context) => {

                        if(!events.length) return;

                        //gain the listener functions on this subscription.
                        const subscription = this.subscriptions.find(subscription =>
                            subscription.topic === topic && subscription.direction === direction );

                        //gain the reply hub.
                        const replyDirection = direction === 'inbound' ? 'outbound' : 'inbound';
                        const replyingProducer = this.getProducer({topic, direction: replyDirection}).client;
                        const batch = await replyingProducer.createBatch();

                        if(isInvocation){
                            for(const event of events) {
                                if(event.body.cid === cid) {
                                    listener(event.body.result);
                                    await context.updateCheckpoint(event);
                                }
                            }
                        }
                        else {
                            for(const event of events) { 
                                for(const listener of subscription.listeners) {
                                    const {cid, payload, result} = event.body;
                                    const rtrn = listener(payload);
                                    const response = rtrn instanceof Promise ? await rtrn : rtrn;
                                    batch.tryAdd({body: {cid, result: response}});
                                }
                                await context.updateCheckpoint(event);
                            }
                            await replyingProducer.sendBatch(batch);
                        }
                    },
                    processError: async (err, context) => {
                        console.log(`Errored ${err}`);
                    }
                }
            );

            await onResolvedProp(subscription, 'isRunning')

            const consumerSubscription:I.ConsumerSubscription = {
                topic,
                direction,
                subscription,
                consumer,
                type: 'consumer',
                listeners: []
            }

            this.subscriptions.push(consumerSubscription);

            logger.info(`Built subscription for ${directionalTopic}`)

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
     * @param props.topci string the eventhub/topic
     */
    getProducer( props:I.getProducerProps=C.getProducerDefaults) {

        try {

            //destrucute
            const {
                topic,
                direction
            } = props;

            //qualify arguments
            if(!topic)
                throw `missing argument "topic"`
            if(direction !== 'inbound' && direction !== 'outbound')
                throw 'invalid direction, argue either "inbound" or "outbound"'

            const existing = this.producers.find(producer => 
                producer.topic === topic && producer.direction === direction
            );

            if(existing)
                return existing;

            const directionalTopic = `${topic}-${direction}`;

            const client = new EventHubProducerClient(
                this.config['AZURE_EVENTHUB_CONNECTION_STRING'],
                directionalTopic
            );

            const producer = { topic, direction, client };
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

            if(!config.AZURE_EVENTHUB_NAMESPACE)
                logger.warn(`No default eventhub has been registered, all invocations and listeners must specify their eventhub namespace/hub`);

            if(typeof config.AZURE_EVENTHUB_CONNECTION_STRING !== 'string' || config.AZURE_EVENTHUB_CONNECTION_STRING.length < 1)
                throw `could not determine AZURE_EVENTHUB_CONNECTION_STRING`;

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