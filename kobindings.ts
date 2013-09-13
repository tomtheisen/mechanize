declare var ko;

(function () {
    function setTitle(element: HTMLElement, valueAccessor: () => string) {
        element.title = valueAccessor();
    }

    ko.bindingHandlers.title = { init: setTitle, update: setTitle };
})();