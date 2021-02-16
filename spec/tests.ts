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

        describe(`EventHubEngine::getConsumerSubscription`, () => {

            it(`Method exists on instance`, () => {
                assert(typeof instance.getConsumerSubscription === 'function', 'failed');
            });

            it(`Returns a consumer subscription`, async () => {

                const result = await instance.getConsumerSubscription({topic: `mocha-test`, direction: 'inbound'});
                assert(result.subscription.isRunning, 'failed');
            });

            it(`Unsubscribes`, async () => {
                const result = await instance.unsubscribe();
            })
        });

        describe(`EventHubEngine::getProducer`, () => {

            it(`Method exists on instance`, () => {

                assert(typeof instance.getProducer === 'function', 'failed');

                it(`Errors when topic is not argued`, function(done) {

                    try {
                        instance.getProducer();
                        done('failed');
                    }
                    catch( err ) {
                        done();
                    }
                
                });
    
                it(`Returns a EventHubProducerClient`, () => {
    
                    const result = instance.getProducer({topic: `mocha-test`, direction: 'outbound'});
                    assert(result instanceof EventHubProducerClient, 'failed');
                });
    
            });

        });

        describe(`EventHubEngine::invoke`, () => {

            let heard = false;

            it(`sets a listener up for this test`, async () => {

                await instance.subscribe({
                    topic: 'mocha-test',
                    listener: async msg => {
                        heard = true;
                        return 'mocha-test-listener-response';
                    }
                });

            });

            it(`Invokes`, async () => {

                const result = await instance.invoke({topic: 'mocha-test', payload: 'mocha-test invocation'});
                assert(heard && result === 'mocha-test-listener-response', 'failed');
            })

            it(`Cleanup`, async () => {

                await instance.unsubscribe();
            })

        });

        describe(`Class decoration`, () => {

            @event_hub_class()
            class myTest {

                eventhub:EventHubEngine;

                @listen({hub:'mocha-test', topic: 'mocha-test'})
                async myMethod(msg) {
                    assert(msg.hasOwnProperty('test_one'), 'myTest::myMethod on the decorated testclass got a message that did not contain the prop "test_one"');
                    assert(msg.test_one === 'success', 'myTest:myMethod on the decorated testclass expected the value of test_one to be "success"');
                    return {success: 'test_one'};
                }

                async myMethod2( msg ) {
                    console.log('---')
                }

            }

            let instance:myTest;

            it(`Instances the decorated class`, done => {

                instance = new myTest();
                instance.eventhub.once('ready', _ => done());
            });

            it(`Invokes a method`, async () => {

                const result = await instance.eventhub.invoke({topic: 'mocha-test', payload: {test_one:"success"}})
                assert(result.hasOwnProperty('success'), 'failed');
                assert(result.success === 'test_one', 'failed');
            });

        });


    });

});