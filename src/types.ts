
export interface EventHubEngineConfig {
    AZURE_EVENTHUB_CONNECTION_STRING?: string;
    AZURE_EVENTHUB_NAMESPACE?: string;
}

export interface EventHubEngineProps {
    config?: EventHubEngineConfig;
    listeners?: Array<Function>;
}

export interface EgetConsumerSubscriptionProps {
    hub?: string;
    topic: string;
    direction: 'inbound'|'outbound';
    consumerGroup?: string;
    isInvocation?: boolean;
    cid?:string;
    listener?:Function;
}

export interface ProducerClient {
    topic: string;
    direction: 'inbound'|'outbound';
    client: any;
}

export interface getProducerProps {
    topic: string;
    direction: 'inbound'|'outbound';
}

export interface invokeProps {
    topic: string;
    payload: any;
}

export interface ElistenProps {
    hub: string;
    topic: string;
    listener: Function;
}

export interface Subscription {
    topic: string;
    direction: 'inbound'|'outbound';
    subscription: any;
    type: 'consumer'|'producer';
}

export interface ConsumerSubscription extends Subscription{
    type: 'consumer';
    consumer: any;
    listeners: Array<any>;
}

export interface Message {
    cid: string;
    payload: any;
}

export interface unsubscribeProps {
    topic?: string;
    direction?: 'inbound'|'outbound';
}

export interface dEvent_hub_class {
    config?:EventHubEngineConfig
}

export interface dListen{
    hub?: string,
    topic?:string;
}