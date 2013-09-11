/// <reference path="typescript refs\sugar.d.ts" />
/// <reference path="typescript refs\zepto.d.ts" />
/// <reference path="utils.ts" />
/// <reference path="mechanize.ts" />

declare var DragDrop;
module Interface {
    import GameState = Mechanize.MechanizeViewModel;
    import Notifications = Mechanize.Notifications;
    var sugarObject = <ObjectStatic><any> Object; // for sugar methods on Object

    export function saveModel() {
        try {
            var serialized = ko.toJSON(GameState, (key: string, value) => value == null ? undefined : value);
            window.localStorage.setItem("mechanize", serialized);
            Notifications.show("Saved successfully.");
            return true;
        } catch (e) {
            Notifications.show("Error occurred during save.");
            return false;
        }
    };

    export function showNotification(message: string) {
        var $notification = $("<div />").addClass("notification").text(message)
            .appendTo("#notifications");

        var args = { "max-height": "0px", "max-width": "0px", opacity: 0 };
        window.setTimeout(function () {
            $notification.animate(args, 4000, "ease", () => { $notification.remove(); });
        }, 10000);
    }

    export function bumpDevice(name: string) {
        var $receiver = $("[data-device='" + name + "']");
        $receiver.addClass("bumped");
        window.setTimeout(() => $receiver.removeClass("bumped"), 1000);
    }

    export function errorDevice(name: string) {
        $("[data-device='" + name + "']").addClass("error");
    }

    export function setVisualEffects(on: boolean) {
        if (on) {
            $("body").addClass("vfx");
        } else {
            $("body").removeClass("vfx");
        }
    }

    export var killed = false;     // set when fatal error occurs and all execution should stop
    export function kill(message: string) {
        message = message || "Something bad happened. :(";

        $("#gameSurface").hide();
        $("#systemMessage").text(message)
            .append('<br><a href="javascript:location.reload();">Reload</a>')
            .append('<br><a href="javascript:window.localStorage.removeItem(\'mechanize\');location.reload();">Reset data</a>')
            .show();

        killed = true;
    };

    function arrangeAllPanels() {
        var top = 0, left = 0;
        var totalHeight = $("#gameSurface").height();

        $("#gameSurface .panel").forEach(function (panel) {
            var $panel = $(panel), height = $panel.height();

            if (top + height > totalHeight) {
                top = 0;
                left += $panel.width();
            }

            $panel.css({ top: top + "px", left: left + "px" });
            top += height;
        });
    }

    function bringToFront (element: HTMLElement) {
        var maxZ = $("#gameSurface .panel").get().map(function (panel) {
            return parseInt(panel.style.zIndex, 10) || 0;
        }).max();
        $(element).css("z-index", maxZ + 1).removeClass("error");
    };

    var dragDropBindings = [];
    function makeDraggable (node: HTMLElement) {
        if (node.classList && node.classList.contains("panel")) {
            var $node = $(node);
            var handle = $node.find("h2")[0];
            var options = {
                anchor: handle,
                boundingBox: 'offsetParent',
                dragstart: bringToFront.bind(null, node)
            };
            bringToFront(node);
            var newLeft = $("#gameSurface .panel").get().map(function (panel) {
                return parseInt(panel.style.left, 10) + $(panel).width() || 0;
            }).max();
            var farRight = $("#gameSurface").width() - $node.width();
            $node.css("left", Math.min(newLeft, farRight) + "px");

            var binding = DragDrop.bind(node, options);
            (<any> Object).merge(binding, { element: node }); // sugar
            dragDropBindings.push(binding);
        }
    };

    function unmakeDraggable (node: HTMLElement) {
        var binding = dragDropBindings.find(b => b.element === node);
        if (!binding) return;
        DragDrop.unbind(binding);
    };

    function registerGameSurfaceDomObserver() {
        var observer: MutationObserver = new (<any> MutationObserver)(mutations => {
            mutations.forEach(mutation => {
                Array.prototype.forEach.call(mutation.addedNodes, makeDraggable);
                Array.prototype.forEach.call(mutation.removedNodes, unmakeDraggable);
            });
        });

        $("#gameSurface .panel").forEach(makeDraggable);
        observer.observe($("#gameSurface")[0], { childList: true });
    }

    function resetGame() {
        var $controls = $("#gameControls > *").hide();

        var $yes = $("<button />").addClass("warning").text("yes");
        var $no = $("<button />").text("no");

        var $confirmation = $("<div />").text("Reset and lose all data?").append($yes).append($no);
        $("#gameControls").append($confirmation);

        $no.on("click", e => {
            $confirmation.remove();
            $controls.show();
            return true;
        });

        $yes.on("click", e => {
            window.localStorage.removeItem('mechanize');
            window.location.reload();
            return true;
        });
    }

    function toggleHeaderMax() {
        $("header .max-toggle").toggleClass("active").parent().toggleClass("maxed");
    }

    function collapseAllPanels() {
        GameState.devices.all().forEach(device => device.collapse());
    }

    function expandAllPanels() {
        GameState.devices.all().forEach(device => device.expand());
    }

    function detachAllPanels() {
        GameState.devices.all().forEach(device => device.detach());
    }

    function clearAllErrors() {
        $(".error").removeClass("error");
    }

    window.addEventListener("load", function () {
        var serialized: string = window.localStorage.getItem('mechanize');

        try {
            GameState.loadOrInitialize();
        } catch (e) {
            console.log(e.message);
            console.log(e.stack);
            return kill("Failed to set up game.");
        }

        registerGameSurfaceDomObserver();
        arrangeAllPanels();

        $("body").on("click", "#saveButton", saveModel);

        $("body").on("click", "#resetButton", Utils.makeHandler(resetGame));

        $("body").on("click", "#arrangePanelsButton", Utils.makeHandler(arrangeAllPanels));

        $("body").on("click", ".collapser.auto", Utils.makeHandler(function() {
            $(this).toggleClass("expanded").toggleClass("collapsed");
        }));

        $("#notificationsButton").on("click", Utils.makeHandler(function() {
            $("#notificationsLog").toggle();
        }));

        $("#notifications").on("click", ".notification", Utils.makeHandler(function()  {
            $(this).remove();
        }));

        $("header .max-toggle").on("click", Utils.makeHandler(toggleHeaderMax));

        $(document).on("keydown", (e: KeyboardEvent) => {
            var commands: { [which: number]: () => void } = {
                27: toggleHeaderMax,
                192: toggleHeaderMax,
                65: arrangeAllPanels,
                67: clearAllErrors,
                68: detachAllPanels,
                69: expandAllPanels,
                70: Utils.toggleFullScreen,
                77: collapseAllPanels,
            };
            var command = commands[e.which];
            if (command) command();
            return true;
        });

        $(document.documentElement).on(
            "fullscreenchange webkitfullscreenchange mozfullscreenchange",
            Utils.makeHandler(() => GameState.options.fullScreen(Utils.currentlyFullScreen())));

        $("#helpButton, #keyboardButton, #creditsButton").on("click",
            Utils.makeHandler(() => GameState.notifications.show("todo: something")));

        $("#systemMessage").hide();
        $("#gameSurface").css("visibility", "");
    });
}