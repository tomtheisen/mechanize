/// <reference path="typescript refs\knockout.d.ts" />
/// <reference path="typescript refs\zepto.d.ts" />

(function () {
    function setTitle(element: HTMLElement, valueAccessor: () => string) {
        element.title = valueAccessor();
    }

    ko.bindingHandlers["title"] = { init: setTitle, update: setTitle };

    ko.bindingHandlers["modelevent"] = {
        init: function (element: HTMLElement, valueAccessor: () => any, allBindingsAccessor: () => any, viewModel, bindingContext) {
            var value = valueAccessor();

            var event: string = value.event;
            var publisher: KnockoutObservable<any> = value.publisher;
            var handler: (args) => any = value.handler;

            var subscription = publisher.subscribe(handler, element, event);
            ko.utils.domNodeDisposal.addDisposeCallback(element, () => subscription.dispose());
        },
    };

    function switchHandler(element: HTMLElement, valueAccessor: () => any) {
        $(element).children().hide().filter("[data-case='" + valueAccessor()() + "']").show();
    }
    ko.bindingHandlers["switch"] = { init: switchHandler, update: switchHandler };

    ko.bindingHandlers["setonclick"] = {
        init: function<T>(element: HTMLElement, valueAccessor: () => any, allBindingsAccessor: () => any, viewModel, bindingContext) {
            var value: { target: KnockoutObservable<T>; value: T; } = valueAccessor();
            var setter = () => (() => value.target(ko.unwrap(value.value)));
            ko.bindingHandlers.click.init(element, setter, allBindingsAccessor, viewModel, bindingContext);
        },
    };
})();