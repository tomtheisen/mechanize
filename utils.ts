module Utils {
    export function makeHandler(fn: () => void) {
        return function(e: Event) { fn.call(this); return true; };
    }

    export function makeArray<T>(length: number, element: () => T): Array<T>;
    export function makeArray<T>(length: number, element: T): Array<T>;

    export function makeArray<T>(length: number, element): Array<T> {
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

    export function fullScreen() {
        var de: any = document.documentElement;
        if (de.requestFullscreen) de.requestFullscreen();
        else if (de.mozRequestFullScreen) de.mozRequestFullScreen();
        else if (de.webkitRequestFullscreen) de.webkitRequestFullscreen();
    }

    export function exitFullScreen() {
        var d: any = document;
        if (d.cancelFullScreen) d.cancelFullScreen();
        else if (d.mozCancelFullScreen) d.mozCancelFullScreen();
        else if (d.webkitCancelFullScreen) d.webkitCancelFullScreen();
    }

    export function toggleFullScreen() {
        if (currentlyFullScreen()) {
            exitFullScreen();
        } else {
            fullScreen();
        }
    }

    export function currentlyFullScreen(): boolean {
        var d: any = document;
        return !!(d.fullscreenElement ||    // alternative standard method
            d.mozFullScreenElement || d.webkitFullscreenElement);
    }
}