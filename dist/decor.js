"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listen = exports.event_hub_class = void 0;
const engine_1 = require("./engine");
/**
 * Class decorator which providing default configuration for its decorated methods
 *
 * @param options dEvent_hub_class
 */
function event_hub_class(options = {}) {
    return cls => {
        return class EventHubWrapper extends cls {
            constructor(...args) {
                super(args);
                //merge the listeners into the constructor args of this decorated class.
                const engineArgs = this._eventhub_listeners instanceof Array
                    ? Object.assign({}, options, { listeners: this._eventhub_listeners })
                    : Object.assign({}, options);
                //instantiate the engine as this.eventhub upon the decorated class context.
                this.eventhub = new engine_1.EventHubEngine(engineArgs);
            }
        };
    };
}
exports.event_hub_class = event_hub_class;
/**
 * Method decorator allowing a method to participate as a listener.
 *
 * @param options the options object
 * @param options.hub the eventhub to consume
 * @param options.topic string the topic to listen for on the hub
 */
function listen(options = {}) {
    return function wrapper(cls, name, descriptor) {
        let { hub, topic } = options;
        //default the topic to the method name when not provided.
        topic = topic || descriptor.value.name;
        cls._eventhub_listeners = cls._eventhub_listeners || [];
        cls._eventhub_listeners.push({ topic, hub, listener: descriptor.value });
    };
}
exports.listen = listen;
//# sourceMappingURL=decor.js.map