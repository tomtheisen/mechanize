module Utils {
    export function makeHandler(fn: () => void) {
        return function(e: Event) { fn.call(this); return true; };
    }

    export function makeArray(length: number, element): Array {
        var isFunction = typeof (element) === "function";

        var result = [];
        for (var i = 0; i < length; i++) {
            result.push(isFunction ? element() : element);
        }

        return result;
    }

    export function getFormattedTimespan(totalSeconds: number): string {
        var seconds = totalSeconds % 60;
        var totalMinutes = Math.floor(totalSeconds / 60);
        var minutes = totalMinutes % 60;
        var totalHours = Math.floor(totalMinutes / 60);

        var formatted = "";

        if (totalHours) formatted += totalHours + ":";
        if (formatted || minutes) formatted += (formatted && minutes < 10 && "0") + minutes + ":";
        formatted += (formatted && seconds < 10 && "0") + seconds;

        return formatted;
    }
}