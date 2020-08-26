/* global gapi */
/*exported ThrottledBatch, persistentCoalesce */
/*jshint esversion: 6 */
/*jshint unused:true */

/** version abc */


/**
 * Doesn't wait for a reply before trying next batch.
 * TODO: Stop on errors
 */
class ThrottledBatch {
    constructor(maxPerBatch = 25, waitTimeMs = 1000) {
        this.maxPerBatch = maxPerBatch;
        this.waitTimeMs = waitTimeMs;
        this.queue = {};
        this.results = {};
    }

    /** Work through the entire queue. We don't care about ordering. */
    execute() {
        const batches = chunk(Object.keys(this.queue), this.maxPerBatch);
        console.info(`ThrottledBatch trying ${batches.length} batches, wait time ${this.waitTimeMs}ms`);
        return Promise.all(
            batches.map((batch, i) => {
                return new Promise(resolve => {
                    setTimeout(() => {
                        console.info(`ThrottledBatch calling batch { number:${i}, length:${batch.length} }`);
                        const gbatch = gapi.client.newBatch();
                        batch.forEach(id => gbatch.add(this.queue[id], {
                            id: id
                        }));
                        gbatch.then(batchResult => {
                            console.info(`ThrottledBatch response for batch ${i}`);
                            Object.assign(this.results, batchResult.result);
                            resolve();
                        });
                    }, i * this.waitTimeMs);
                }).catch(err => {
                    console.error(`Error with ThrottledBatch single batch ${i}`, err);
                    throw err;
                });
            })
        ).then(() => {
            return this.results;
        }).catch(err => {
            console.error('Error with ThrottledBatch all:', err);
            throw err;
        });
    }

    /** Add a gapi call (promise) and optional ID. */
    add(p, id = (Object.keys(this.queue).length + 1)) {
        this.queue[id] = p;
    }

    toString() {
        return `ThrottledBatch{max:${this.maxPerBatch},wait:${this.waitTimeMs},queue:${Object.keys(this.queue).length}}`;
    }
}

// Utility from http://stackoverflow.com/questions/8495687/split-array-into-chunks
function chunk(arr, n) {
    "use strict";
    return Array.from(Array(Math.ceil(arr.length / n)), (_, i) => arr.slice(i * n, i * n + n));
}


const persistentCoalesceLookup = {};

/**
 * Return the first non-null arg.
 * Remember which values can be mapped to other values.
 * If a value can be mapped, it is.
 * eg: "null, a, b, c" returns a, and remembers that b maps to a, and c maps to a.
 * Don't make loops.
 *
 * Used to map fuzzy identifiers (names) to hard identifiers (emails)
 *
 * @param args multiple args, some of which may be null
 * @return {?string}
 */
function persistentCoalesce(...args) {
    let firstOkVal = null;
    for (const arg of args) {
        if (arg !== null) {
            if (firstOkVal === null) {
                firstOkVal = arg;
            }
            // Always set if empty, always set if not-self.
            if (!persistentCoalesceLookup.hasOwnProperty(arg) || firstOkVal !== arg) {
                persistentCoalesceLookup[arg] = firstOkVal;
            }
        }
    }
    // Roll up as much as possible
    let loops = 0;
    while (persistentCoalesceLookup.hasOwnProperty(firstOkVal) && persistentCoalesceLookup[firstOkVal] !== firstOkVal) {
        firstOkVal = persistentCoalesceLookup[firstOkVal];
        loops++;
        if (loops > 1000) {
            throw `persistentCoalesce fatal loop in ${firstOkVal} ${JSON.stringify(persistentCoalesceLookup)}`;
        }
    }
    return firstOkVal;
}