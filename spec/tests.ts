require('dotenv').config();
import {
    describe,
    it
} from 'mocha';
import { assert } from 'chai';
import {
    EventHubEngine,
    event_hub_class,
    listen
} from '../src';
import {
    EventHubConsumerClient,
    EventHubProducerClient
} from '@azure/event-hubs';

describe(`EventHub Tests version 2`, function() {

    describe(`Setup`, () => {

        it(`Ensures we have the correct environment variables`, () => {

            //assert(typeof process.env['AZURE_TENANT_ID'] === 'string', 'Environment missing AZURE_TENANT_ID');
            //assert(typeof process.env['AZURE_CLIENT_ID'] === 'string', 'Environment missing AZURE_CLIENT ID');
            //assert(typeof process.env['AZURE_CLIENT_SECRET'] === 'string', 'Environment missing AZURE_CLIENT_SECRET');
            assert(typeof process.env['AZURE_EVENTHUB_CONNECTION_STRING'] === 'string', 'Environment missing AZURE_EVENTHUB_CONNECTION_STRING');
        });

    });

    describe(`EventHubEngine Tests`, () => {

        describe(`Configuration`, () => {

            let instance:EventHubEngine;

            it(`Instantiates`, () => {

                instance = new EventHubEngine();
            })

            it(`configures from construction`, () => {

                assert(
                    instance.config.hasOwnProperty('AZURE_EVENTHUB_CONNECTION_STRING') &&
                    instance.config['AZURE_EVENTHUB_CONNECTION_STRING'].length,
                    'failed.'
                );
            });

        });

        describe(`EventHubEngine::getConsumerSubscription`, () => {

            const instance = new EventHubEngine();

            it(`Method exists on instance`, () => {
                assert(typeof instance.getConsumerSubscription === 'function', 'failed');
            });

            it(`Returns a consumer subscription`, async () => {
                const result = await instance.getConsumerSubscription({hub: 'mocha-test', topic: `test`, direction: 'inbound'});
                assert(result.subscription.isRunning, 'failed');
            });

            it(`Unsubscribes`, async () => {
                const result = await instance.unsubscribe();
            })
        });

        describe(`EventHubEngine::getProducer`, () => {

            const instance = new EventHubEngine();

            it(`Method exists on instance`, () => {

                assert(typeof instance.getProducer === 'function', 'failed');
            });

            it(`Errors when hub is not argued`, function(done) {

                try {
                    instance.getProducer();
                    done('failed');
                }
                catch( err ) {
                    done();
                }
                
            });
    
            it(`Returns a EventHubProducerClient`, () => {
    
                const result = instance.getProducer({hub: `mocha-test`, direction: 'outbound'});
                assert(result.client instanceof EventHubProducerClient, 'failed');
            });

        });

        describe(`EventHubEngine::invoke`, () => {

            const instance = new EventHubEngine();
            let heard = false;

            it(`sets a listener up for this test`, async () => {

                await instance.subscribe({
                    hub: 'mocha-test',
                    topic: 'listen-test-1',
                    listener: async msg => {
                        heard = true;
                        return 'mocha-test-listener-response';
                    }
                });

                await instance.subscribe({
                    hub: 'mocha-test',
                    topic: 'listen-test-2',
                    listener: async msg => {
                        heard = true;
                        return 'mocha-test-listener-response';
                    }
                });

            });

            it(`Invokes`, async () => {

                const result = await instance.invoke({
                    hub: 'mocha-test',
                    topic: 'listen-test-1',
                    payload: 'mocha-test invocation'
                });
                assert(heard && result === 'mocha-test-listener-response', 'failed');
            })

            it(`Cleanup`, async () => {

                await instance.unsubscribe();
            })

        });

        describe(`EventHubEngine::invoke - using callback`, () => {

            const instance = new EventHubEngine();
            let heard = false;


            it(`sets a listener up for this test`, async () => {

                await instance.subscribe({
                    hub: 'mocha-test',
                    topic: 'invoke-test-callback',
                    listener: async msg => {
                        return 'mocha-test-listener-response';
                    }
                });

                const result = await instance.invoke({
                    hub: 'mocha-test',
                    topic: 'invoke-test-callback',
                    payload: 'mocha-test invocation',
                    callback: async msg => {
                        heard = true;
                    }
                });

                let interval = null;

                await new Promise((resolve, reject) => {
                    interval = setInterval(() => {
                        if(heard === true) {
                            clearInterval(interval);
                            resolve(true);
                        }
                    }, 1000);
                })

            });

        });

        describe(`Class decoration`, () => {


            @event_hub_class()
            //@ts-ignore
            class myTest {

                eventhub:EventHubEngine;

                @listen({hub: "mocha-test", topic:'mocha-test-dec-1'})
                //@ts-ignore
                async myMethod(msg) {
                    assert(msg.hasOwnProperty('test_one'), 'myTest::myMethod on the decorated testclass got a message that did not contain the prop "test_one"');
                    assert(msg.test_one === 'success', 'myTest:myMethod on the decorated testclass expected the value of test_one to be "success"');
                    return {success: 'test_one'};
                }

                // @listen({})
                // async myMethod2( msg ) {
                //     console.log('---')
                // }

            }

            let instance:myTest;

            it(`Instances the decorated class`, done => {

                instance = new myTest();
                instance.eventhub.once('ready', _ => done());
            });

            it(`Invokes a method`, async () => {

                const result = await instance.eventhub.invoke({hub: 'mocha-test', topic: 'mocha-test-dec-1', payload: {test_one:"success"}})
                assert(result.hasOwnProperty('success'), 'failed');
                assert(result.success === 'test_one', 'failed');
            });

            it(`Invokes the same method, causing a existing event consumer to be used`, async () => {

                const result = await instance.eventhub.invoke({hub: 'mocha-test', topic: 'mocha-test-dec-1', payload: {test_one:"success"}});
                assert(result.hasOwnProperty('success'), 'failed');
                assert(result.success === 'test_one', 'failed');

            });

            it(`Instance state test`, () => {
                assert(instance.eventhub, 'failed');
                assert(instance.eventhub.subscriptions.length === 2, 'expected a subscription for mocha-test-inbound and mocha-test-outbound');

                const inboundSub = instance.eventhub.subscriptions.find(sub => sub.direction === 'inbound');
                const outboundSub = instance.eventhub.subscriptions.find(sub => sub.direction === 'outbound');

                assert(inboundSub && outboundSub, 'we have 2 subs but expect an inbound and outbound, which they are not');
                assert(inboundSub.listeners.length === 1, `expected 1 listener on the inbound sub (the decorated method listening) but we have ${inboundSub.listeners.length}`);
                assert(outboundSub.listeners.length === 0, `expected 0 listeners on the outbound sub (listeners should no longer exist) but we have ${inboundSub.listeners.length}`);
            })

        });


    });

});