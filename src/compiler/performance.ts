/*@internal*/
/** Performance measurements for the compiler. */
namespace ts.performance {
    declare const onProfilerEvent: { (markName: string): void; profiler: boolean; };

    // NOTE: cannot use ts.noop as core.ts loads after this
    const profilerEvent: (markName: string) => void = typeof onProfilerEvent === "function" && onProfilerEvent.profiler === true ? onProfilerEvent : () => { /*empty*/ };

    let enabled = false;
    let profilerStart = 0;
    let counts: Map<number>;
    let marks: Map<number>;
    let measures: Map<number>;
    let logDepth = 0;
    let isFirstLogEvent = true;

    export interface Timer {
        enter(): void;
        exit(): void;
    }

    export function createTimerIf(condition: boolean, measureName: string, startMarkName: string, endMarkName: string) {
        return condition ? createTimer(measureName, startMarkName, endMarkName) : nullTimer;
    }

    export function createTimer(measureName: string, startMarkName: string, endMarkName: string): Timer {
        let enterCount = 0;
        return {
            enter,
            exit
        };

        function enter() {
            if (++enterCount === 1) {
                mark(startMarkName);
            }
        }

        function exit() {
            if (--enterCount === 0) {
                mark(endMarkName);
                measure(measureName, startMarkName, endMarkName);
            }
            else if (enterCount < 0) {
                Debug.fail("enter/exit count does not match.");
            }
        }
    }

    export const nullTimer: Timer = { enter: noop, exit: noop };

    /**
     * Marks a performance event.
     *
     * @param markName The name of the mark.
     */
    export function mark(markName: string) {
        if (enabled) {
            marks.set(markName, timestamp());
            counts.set(markName, (counts.get(markName) || 0) + 1);
            profilerEvent(markName);
        }
    }

    /**
     * Adds a performance measurement with the specified name.
     *
     * @param measureName The name of the performance measurement.
     * @param startMarkName The name of the starting mark. If not supplied, the point at which the
     *      profiler was enabled is used.
     * @param endMarkName The name of the ending mark. If not supplied, the current timestamp is
     *      used.
     */
    export function measure(measureName: string, startMarkName?: string, endMarkName?: string) {
        if (enabled) {
            const end = endMarkName && marks.get(endMarkName) || timestamp();
            const start = startMarkName && marks.get(startMarkName) || profilerStart;
            measures.set(measureName, (measures.get(measureName) || 0) + (end - start));
            logSlowEvent(measureName, end - start);
        }
    }

    /**
     * Gets the number of times a marker was encountered.
     *
     * @param markName The name of the mark.
     */
    export function getCount(markName: string) {
        return counts && counts.get(markName) || 0;
    }

    /**
     * Gets the total duration of all measurements with the supplied name.
     *
     * @param measureName The name of the measure whose durations should be accumulated.
     */
    export function getDuration(measureName: string) {
        return measures && measures.get(measureName) || 0;
    }

    /**
     * Iterate over each measure, performing some action
     *
     * @param cb The action to perform for each measure
     */
    export function forEachMeasure(cb: (measureName: string, duration: number) => void) {
        measures.forEach((measure, key) => {
            cb(key, measure);
        });
    }

    /** Enables (and resets) performance measurements for the compiler. */
    export function enable() {
        counts = createMap<number>();
        marks = createMap<number>();
        measures = createMap<number>();
        enabled = true;
        profilerStart = timestamp();
    }

    /** Disables performance measurements for the compiler. */
    export function disable() {
        enabled = false;
    }

    /**
     * Increases the "depth" -- similar to the depth of a stack trace.
     *
     * This is used in the logging functions below. It sometimes results in better flame
     * graphs.
     */
    export function increaseLogDepth() {
        logDepth++;
    }

    export function decreaseLogDepth() {
        logDepth--;
    }

    /** Calls logCompleteEvent() only if the event was "slow" (more than 10 milliseconds) */
    export function logSlowEvent(name: string, durationMillis: number, args?: any) {
        if (durationMillis > 10) {
            const rand = Math.floor(Math.random() * 10000);
            logCompleteEvent(`${name}-${rand}`, durationMillis, args);
        }
    }

    /**
     * Logs one "complete event" to stdout in chrome's profile format, as documented here:
     * https://docs.google.com/document/d/1CvAClvFfyA5R-PhYUmn5OOQtYMH4h6I0nSsKchNAySU/preview#heading=h.lpfof2aylapb
     * A complete event is one that has a begin time and a duration.
     */
    export function logCompleteEvent(name: string, durationMillis: number, args?: { [key: string]: any; }) {
        logTraceEvent({
            name,
            cat: "build",
            ph: "X",  // the phase type for "complete event", as per the doc
            pid: 1,
            tid: logDepth,  // we store the "depth" in the thread id; this gives us better graphs
            ts: (Date.now() - durationMillis) * 1000,  // microseconds
            dur: durationMillis * 1000,
            ...(args && { args })  // only log "args:" if there are any
        });
    }

    /**
     * Logs one event to stdout in chrome's trace event format, as documented here:
     * https://docs.google.com/document/d/1CvAClvFfyA5R-PhYUmn5OOQtYMH4h6I0nSsKchNAySU/preview
     *
     * Redirect compiler output to a file, e.g. `tsc > mybuild.profile`. Then open Chrome,
     * navigate to `chrome://tracing`, click Load, and load mybuild.profile.
     */
    export function logTraceEvent(data: any) {
        if (isFirstLogEvent) {
            console.log("[");
            isFirstLogEvent = false;
        }
        console.log("  " + JSON.stringify(data) + ",");
    }
}
