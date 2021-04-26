

// types have a capital lead-in character indicating where they may be used
//   - starting with a "d" indicates they're used with decorator props or returns
//   - staring with a "E" indicates they're for engine methods


import {
    EventHubConsumerClient,
    EventHubProducerClient
} from '@azure/event-hubs';
import { unsubscribeDefaults } from './const'

export interface EventHubEngineConfig {

    /* the eventhubs installation name or "NAMESPACE" as its called in azure lingo*/
    AZURE_EVENTHUB_NAMESPACE?: string;

    /* an eventhub to use as default - very useful because we use a single hub routed by topics*/
    AZURE_DEFAULT_EVENTHUB?: string;

    /* the connection string, aquired by the azure portal (currently under "Shared access policies"-><Policy Name (eg "RootManageSharedAccesKey")") */
    AZURE_EVENTHUB_CONNECTION_STRING?: string;
}

export interface EventHubEngineProps {
    config?: EventHubEngineConfig;
    listeners?: Array<Function>;
}

export interface EgetConsumerSubscriptionProps {
    /* the hub to communicate over, default: instance.config.AZURE_DEFAULT_EVENTHUB */
    hub?: string;
    /* essentially a route key for this eventhub communication */
    topic: string;
    /* the direction for this topic, used for RPC pattern*/
    direction: 'inbound'|'outbound';
    /* the consumer group for this consumer client*/
    consumerGroup?: string;
    /* this subscription is faciliated by the RPC pattern, and is the reply topic/queue*/
    isReplyConsumer?: boolean;
    /* a unique id for this communcation, in the case of RPC communication - it will persist to the reply topic/queue as well*/
    cid?:string;
    /* a listener function */
    listener?:Function;
}

export interface ProducerClient {
    /* the eventhub for this producer to emit messaging upon */
    hub: string;
    /* the direction, used for RPC */
    direction: 'inbound'|'outbound';
    /* producer client */
    client: EventHubProducerClient;
}

export interface getProducerProps {
    hub: string;
    direction: 'inbound'|'outbound';
}

export interface invokeProps {
    hub?: string;
    topic: string;
    payload: any;
    include_cid?: boolean;
    callback?: Function;
}

export interface ElistenProps {
    hub?: string;
    topic: string;
    listener: Function;
}

export interface Subscription {

    /* the name of the eventhub */
    hub: string;

    /* the topic to listen for coming down the eventhub */
    topic?: string;

    /* listen on messages inbound or outbound? */
    direction: 'inbound'|'outbound';

    /* */
    subscription: any;

    /* the subscription type, either listening (consumer) or producing */
    type: 'consumer'|'producer';
}

export interface ConsumerSubscription extends Subscription{
    
    type: 'consumer';
    consumer: any;
    
    /* a list of listeners waiting for messages on this hub */
    listeners: Array<ConsumerSubscriptionListener>;
}

export interface ConsumerSubscriptionListener {

    /* the topic this listener responds/listens for*/
    topic: String;

    /* the listener function */
    listener: Function;

    /* listen for a specific message */
    cid?: String;

    /* only listen once then purge this listener */
    once?: Boolean;
}

export interface ProducerSubscription extends Subscription {
    //nothing for now.
}


export interface Message {
    
    /* a unique id uuid4 for this message */
    cid: string;

    /* the message contents - eventhubs will stringify a javascript object btw */
    payload: any;
}

export interface unsubscribeProps {

    /* the hub we're unsubscribing from */
    hub?: string;

    /* the hub direction we're unsubscribing from */
    direction?: 'inbound'|'outbound';
}

/**
 * @param config EventHubEngineConfig the configuration object
 */
export interface dEvent_hub_class {
    config?:EventHubEngineConfig
}

export interface dListen{
    hub?: string,
    topic?:string;
}