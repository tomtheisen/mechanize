/// <reference path="typescript refs\sugar.d.ts" />
/// <reference path="typescript refs\knockout.d.ts" />
/// <reference path="typescript refs\zepto.d.ts" />
/// <reference path="utils.ts" />
/// <reference path="mechanize.ts" />

declare var DragDrop;
module Interface {
    import GameState = Mechanize.MechanizeViewModel;
    import Notifications = Mechanize.Notifications;

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
        $("[data-device='" + this.name + "']").addClass("error");
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
        var observer = new (<any> MutationObserver)(function (mutations) {
            mutations.forEach(function (mutation) {
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

    function loadGame(model, saved, path?: string) {
        var addDevice = function (deviceCollection, deviceInfo) {
            var device = deviceCollection.createDevice(
                deviceInfo.name, deviceInfo["type"], deviceInfo.params);

            if (deviceInfo.uistate) device.uistate(deviceInfo.uistate);
            if (device.setDeviceInfo) device.setDeviceInfo(deviceInfo);
        };

        for (var key in saved) {
            if (saved.hasOwnProperty(key)) {
                var newPath = (path || "$") + "." + key;
                var savedVal = saved[key];

                if (["number", "string", "boolean"].any(typeof savedVal)) { // sugar
                    if (ko.isObservable(model[key])) model[key](savedVal);

                } else if (newPath === "$.devices") {
                    savedVal.forEach(addDevice.bind(null, model[key]));

                } else {
                    loadGame(ko.utils.unwrapObservable(model[key]), savedVal, newPath);
                }
            }
        }
    }

    window.addEventListener("load", function () {
        var serialized: string = window.localStorage.getItem('mechanize');

        if (serialized) {
            try {
                var saved = JSON.parse(serialized);
                loadGame(GameState, saved);

                ko.applyBindings(GameState);

                Notifications.show("Loaded successfully.");
            } catch (e) {
                console.log(e.message);
                console.log(e.stack);
                return kill("Error occurred during load.");
            }
        } else {
            try {
                GameState.initializeGame();
                ko.applyBindings(GameState);

                Notifications.show("Initialized mechanize version " + GameState.modelVersion + ".  Welcome.");
            } catch (e) {
                console.log(e.message);
                console.log(e.stack);
                return kill("Failed to set up game.");
            }
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

        $("header .max-toggle").on("click", Utils.makeHandler(function () {
            $(this).toggleClass("active").parent().toggleClass("maxed");
        }));

        $("#systemMessage").hide();
        $("#gameSurface").css("visibility", "");
    });
}