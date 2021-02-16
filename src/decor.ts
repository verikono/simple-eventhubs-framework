import { EventHubEngine } from './engine';

import * as I from './types';


export function event_hub_class( options:I.dEvent_hub_class = {} ):Function {

    return cls => {

        return class EventHubWrapper extends cls {

            eventhub:EventHubEngine;
            
            constructor( ...args ) {

                super(args);

                //merge the listeners into the constructor args of this decorated class.
                const engineArgs = this._eventhub_listeners instanceof Array
                    ? Object.assign({}, options, {listeners: this._eventhub_listeners})
                    : Object.assign({}, options);

                //instantiate the engine as this.eventhub upon the decorated class context.
                this.eventhub = new EventHubEngine(engineArgs);

            }

        }

    }

}

/**
 * Method decorator allowing a method to participate as a listener.
 * 
 * @param options the options object
 * @param options.hub the eventhub to consume
 * @param options.topic string the topic to listen for on the hub
 */
export function listen( options:I.dListen={} ) {

    return function wrapper( cls, name, descriptor ) {

        let {
            hub,
            topic
        } = options;

        topic = topic || descriptor.value.name;

        cls._eventhub_listeners = cls._eventhub_listeners || []
        cls._eventhub_listeners.push({topic, hub, listener:descriptor.value});
    }

}