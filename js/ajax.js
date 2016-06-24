/* vim: set expandtab sw=4 ts=4 sts=4: */
/**
 * This object handles ajax requests for pages. It also
 * handles the reloading of the main menu and scripts.
 */
var AJAX = {
    /**
     * @var bool active Whether we are busy
     */
    active: false,
    /**
     * @var object source The object whose event initialized the request
     */
    source: null,
    /**
     * @var object xhr A reference to the ajax request that is currently running
     */
    xhr: null,
    /**
     * @var object lockedTargets, list of locked targets
     */
    lockedTargets: {},
    /**
     * @var function Callback to execute after a successful request
     *               Used by PMA_commonFunctions from common.js
     */
    _callback: function () {},
    /**
     * @var bool _debug Makes noise in your Firebug console
     */
    _debug: false,
    /**
     * @var object $msgbox A reference to a jQuery object that links to a message
     *                     box that is generated by PMA_ajaxShowMessage()
     */
    $msgbox: null,
    /**
     * Given the filename of a script, returns a hash to be
     * used to refer to all the events registered for the file
     *
     * @param key string key The filename for which to get the event name
     *
     * @return int
     */
    hash: function (key) {
        /* http://burtleburtle.net/bob/hash/doobs.html#one */
        key += "";
        var len = key.length, hash = 0, i = 0;
        for (; i < len; ++i) {
            hash += key.charCodeAt(i);
            hash += (hash << 10);
            hash ^= (hash >> 6);
        }
        hash += (hash << 3);
        hash ^= (hash >> 11);
        hash += (hash << 15);
        return Math.abs(hash);
    },
    /**
     * Registers an onload event for a file
     *
     * @param file string   file The filename for which to register the event
     * @param func function func The function to execute when the page is ready
     *
     * @return self For chaining
     */
    registerOnload: function (file, func) {
        var eventName = 'onload_' + AJAX.hash(file);
        $(document).bind(eventName, func);
        if (this._debug) {
            console.log(
                // no need to translate
                "Registered event " + eventName + " for file " + file
            );
        }
        return this;
    },
    /**
     * Registers a teardown event for a file. This is useful to execute functions
     * that unbind events for page elements that are about to be removed.
     *
     * @param string   file The filename for which to register the event
     * @param function func The function to execute when
     *                      the page is about to be torn down
     *
     * @return self For chaining
     */
    registerTeardown: function (file, func) {
        var eventName = 'teardown_' + AJAX.hash(file);
        $(document).bind(eventName, func);
        if (this._debug) {
            console.log(
                // no need to translate
                "Registered event " + eventName + " for file " + file
            );
        }
        return this;
    },
    /**
     * Called when a page has finished loading, once for every
     * file that registered to the onload event of that file.
     *
     * @param string file The filename for which to fire the event
     *
     * @return void
     */
    fireOnload: function (file) {
        var eventName = 'onload_' + AJAX.hash(file);
        $(document).trigger(eventName);
        if (this._debug) {
            console.log(
                // no need to translate
                "Fired event " + eventName + " for file " + file
            );
        }
    },
    /**
     * Called just before a page is torn down, once for every
     * file that registered to the teardown event of that file.
     *
     * @param string file The filename for which to fire the event
     *
     * @return void
     */
    fireTeardown: function (file) {
        var eventName = 'teardown_' + AJAX.hash(file);
        $(document).triggerHandler(eventName);
        if (this._debug) {
            console.log(
                // no need to translate
                "Fired event " + eventName + " for file " + file
            );
        }
    },
    /**
     * function to handle lock page mechanism
     *
     * @param event the event object
     *
     * @return void
     */
    lockPageHandler: function(event) {
        //Don't lock on enter.
        if (0 == event.charCode) {
            return;
        }

        var lockId = $(this).data('lock-id');
        if (typeof lockId === 'undefined') {
            return;
        }
        /*
         * @todo Fix Code mirror does not give correct full value (query)
         * in textarea, it returns only the change in content.
         */
        var newHash = AJAX.hash($(this).val());
        var oldHash = $(this).data('val-hash');
        // Set lock if old value != new value
        // otherwise release lock
        if (oldHash !== newHash) {
            AJAX.lockedTargets[lockId] = true;
        } else {
            delete AJAX.lockedTargets[lockId];
        }
        // Show lock icon if locked targets is not empty.
        // otherwise remove lock icon
        if (!jQuery.isEmptyObject(AJAX.lockedTargets)) {
            $('#lock_page_icon').html(PMA_getImage('s_lock.png',PMA_messages.strLockToolTip).toString());
        } else {
            $('#lock_page_icon').html('');
        }
    },
    /**
     * resets the lock
     *
     * @return void
     */
    resetLock: function() {
        AJAX.lockedTargets = {};
        $('#lock_page_icon').html('');
    },
    /**
     * Event handler for clicks on links and form submissions
     *
     * @param object e Event data
     *
     * @return void
     */
    requestHandler: function (event) {
        // In some cases we don't want to handle the request here and either
        // leave the browser deal with it natively (e.g: file download)
        // or leave an existing ajax event handler present elsewhere deal with it
        var href = $(this).attr('href');
        if (typeof event != 'undefined' && (event.shiftKey || event.ctrlKey)) {
            return true;
        } else if ($(this).attr('target')) {
            return true;
        } else if ($(this).hasClass('ajax') || $(this).hasClass('disableAjax')) {
            //reset the lockedTargets object, as specified AJAX operation has finished
            AJAX.resetLock();
            return true;
        } else if (href && href.match(/^#/)) {
            return true;
        } else if (href && href.match(/^mailto/)) {
            return true;
        } else if ($(this).hasClass('ui-datepicker-next') ||
            $(this).hasClass('ui-datepicker-prev')
        ) {
            return true;
        }

        if (typeof event != 'undefined') {
            event.preventDefault();
            event.stopImmediatePropagation();
        }

        //triggers a confirm dialog if:
        //the user has performed some operations on loaded page
        //the user clicks on some link, (won't trigger for buttons)
        //the click event is not triggered by script
        if (typeof event !== 'undefined' && event.type === 'click' &&
            event.isTrigger !== true &&
            !jQuery.isEmptyObject(AJAX.lockedTargets) &&
            confirm(PMA_messages.strConfirmNavigation) === false
        ) {
            return false;
        }
        AJAX.resetLock();

        if (AJAX.active === true) {
            // Cancel the old request if abortable, when the user requests
            // something else. Otherwise silently bail out, as there is already
            // a request well in progress.
            if (AJAX.xhr) {
                //In case of a link request, attempt aborting
                AJAX.xhr.abort();
                if(AJAX.xhr.status === 0 && AJAX.xhr.statusText === 'abort') {
                    //If aborted
                    AJAX.$msgbox = PMA_ajaxShowMessage(PMA_messages.strAbortedRequest);
                    AJAX.active = false;
                    AJAX.xhr = null;
                } else {
                    //If can't abort
                    return false;
                }
            } else {
                //In case submitting a form, don't attempt aborting
                return false;
            }
        }

        AJAX.source = $(this);

        $('html, body').animate({scrollTop: 0}, 'fast');

        var isLink = !! href || false;
        var url = isLink ? href : $(this).attr('action');
        var params = 'ajax_request=true&ajax_page_request=true';
        if (! isLink) {
            params += '&' + $(this).serialize();
        }
        // Add a list of menu hashes that we have in the cache to the request
        params += AJAX.cache.menus.getRequestParam();

        if (AJAX._debug) {
            console.log("Loading: " + url); // no need to translate
        }

        if (isLink) {
            AJAX.active = true;
            AJAX.$msgbox = PMA_ajaxShowMessage();
            //Save reference for the new link request
            AJAX.xhr = $.get(url, params, AJAX.responseHandler);
        } else {
            /**
             * Manually fire the onsubmit event for the form, if any.
             * The event was saved in the jQuery data object by an onload
             * handler defined below. Workaround for bug #3583316
             */
            var onsubmit = $(this).data('onsubmit');
            // Submit the request if there is no onsubmit handler
            // or if it returns a value that evaluates to true
            if (typeof onsubmit !== 'function' || onsubmit.apply(this, [event])) {
                AJAX.active = true;
                AJAX.$msgbox = PMA_ajaxShowMessage();
                $.post(url, params, AJAX.responseHandler);
            }
        }
    },
    /**
     * Called after the request that was initiated by this.requestHandler()
     * has completed successfully or with a caught error. For completely
     * failed requests or requests with uncaught errors, see the .ajaxError
     * handler at the bottom of this file.
     *
     * To refer to self use 'AJAX', instead of 'this' as this function
     * is called in the jQuery context.
     *
     * @param object e Event data
     *
     * @return void
     */
    responseHandler: function (data) {
        if (typeof data === 'undefined' || data === null) {
            return;
        }
        if (typeof data.success != 'undefined' && data.success) {
            $table_clone = false;
            $('html, body').animate({scrollTop: 0}, 'fast');
            PMA_ajaxRemoveMessage(AJAX.$msgbox);

            if (data._redirect) {
                PMA_ajaxShowMessage(data._redirect, false);
                AJAX.active = false;
                AJAX.xhr = null;
                return;
            }

            AJAX.scriptHandler.reset(function () {
                if (data._reloadNavigation) {
                    PMA_reloadNavigation();
                }
                if (data._title) {
                    $('title').replaceWith(data._title);
                }
                if (data._menu) {
                    AJAX.cache.menus.replace(data._menu);
                    AJAX.cache.menus.add(data._menuHash, data._menu);
                } else if (data._menuHash) {
                    AJAX.cache.menus.replace(AJAX.cache.menus.get(data._menuHash));
                }

                // Remove all containers that may have
                // been added outside of #page_content
                $('body').children()
                    .not('#pma_navigation')
                    .not('#floating_menubar')
                    .not('#goto_pagetop')
                    .not('#lock_page_icon')
                    .not('#page_content')
                    .not('#selflink')
                    .not('#session_debug')
                    .not('#pma_header')
                    .not('#pma_footer')
                    .not('#pma_demo')
                    .not('#pma_console_container')
                    .remove();
                // Replace #page_content with new content
                if (data.message && data.message.length > 0) {
                    $('#page_content').replaceWith(
                        "<div id='page_content'>" + data.message + "</div>"
                    );
                    PMA_highlightSQL($('#page_content'));
                    checkNumberOfFields();
                }

                if (data._selflink) {

                    var source = data._selflink.split('?')[0];
                    //Check for faulty links
                    if (source == "import.php") {
                        var replacement = "tbl_sql.php";
                        data._selflink = data._selflink.replace(source,replacement);
                    }
                    $('#selflink > a').attr('href', data._selflink);
                }
                if (data._scripts) {
                    AJAX.scriptHandler.load(data._scripts);
                }
                if (data._selflink && data._scripts && data._menuHash && data._params) {
                    AJAX.cache.add(
                        data._selflink,
                        data._scripts,
                        data._menuHash,
                        data._params,
                        AJAX.source.attr('rel')
                    );
                }
                if (data._params) {
                    PMA_commonParams.setAll(data._params);
                }
                if (data._displayMessage) {
                    $('#page_content').prepend(data._displayMessage);
                    PMA_highlightSQL($('#page_content'));
                }

                $('#pma_errors').remove();

                var msg = '';
                if(data._errSubmitMsg){
                    msg = data._errSubmitMsg;
                }
                if (data._debug) {
                    $('#session_debug').replaceWith(data._debug);
                }
                if (data._errors) {
                    $('<div/>', {id : 'pma_errors'})
                        .insertAfter('#selflink')
                        .append(data._errors);
                    // bind for php error reporting forms (bottom)
                    $("#pma_ignore_errors_bottom").bind("click", function() {
                        PMA_ignorePhpErrors();
                    });
                    $("#pma_ignore_all_errors_bottom").bind("click", function() {
                        PMA_ignorePhpErrors(false);
                    });
                    // In case of 'sendErrorReport'='always'
                    // submit the hidden error reporting form.
                    if (data._sendErrorAlways == '1' &&
                        data._stopErrorReportLoop != '1'
                    ) {
                        $("#pma_report_errors_form").submit();
                        PMA_ajaxShowMessage(PMA_messages.phpErrorsBeingSubmitted, false);
                        $('html, body').animate({scrollTop:$(document).height()}, 'slow');
                    } else if (data._promptPhpErrors) {
                        // otherwise just prompt user if it is set so.
                        msg = msg + PMA_messages.phpErrorsFound;
                        // scroll to bottom where all the errors are displayed.
                        $('html, body').animate({scrollTop:$(document).height()}, 'slow');
                    }
                }
                PMA_ajaxShowMessage(msg, false);
                // bind for php error reporting forms (popup)
                $("#pma_ignore_errors_popup").bind("click", function() {
                    PMA_ignorePhpErrors();
                });
                $("#pma_ignore_all_errors_popup").bind("click", function() {
                    PMA_ignorePhpErrors(false);
                });

                if (typeof AJAX._callback === 'function') {
                    AJAX._callback.call();
                }
                AJAX._callback = function () {};
            });
        } else {
            PMA_ajaxShowMessage(data.error, false);
            AJAX.active = false;
            AJAX.xhr = null;
            if (parseInt(data.redirect_flag) == 1) {
                // add one more GET param to display session expiry msg
                window.location.href += '&session_expired=1';
                window.location.reload();
            } else if (parseInt(data.reload_flag) == 1) {
                // remove the token param and reload
                window.location.href = window.location.href.replace(/&?token=[^&#]*/g, "");
                window.location.reload();
            }
            if (data.fieldWithError) {
                $(':input.error').removeClass("error");
                $('#'+data.fieldWithError).addClass("error");
            }
        }
    },
    /**
     * This object is in charge of downloading scripts,
     * keeping track of what's downloaded and firing
     * the onload event for them when the page is ready.
     */
    scriptHandler: {
        /**
         * @var array _scripts The list of files already downloaded
         */
        _scripts: [],
        /**
         * @var array _scriptsToBeLoaded The list of files that
         *                               need to be downloaded
         */
        _scriptsToBeLoaded: [],
        /**
         * @var array _scriptsToBeFired The list of files for which
         *                              to fire the onload event
         */
        _scriptsToBeFired: [],
        /**
         * Records that a file has been downloaded
         *
         * @param string file The filename
         * @param string fire Whether this file will be registering
         *                    onload/teardown events
         *
         * @return self For chaining
         */
        add: function (file, fire) {
            this._scripts.push(file);
            if (fire) {
                // Record whether to fire any events for the file
                // This is necessary to correctly tear down the initial page
                this._scriptsToBeFired.push(file);
            }
            return this;
        },
        /**
         * Download a list of js files in one request
         *
         * @param array files An array of filenames and flags
         *
         * @return void
         */
        load: function (files) {
            var self = this;
            self._scriptsToBeLoaded = [];
            self._scriptsToBeFired = [];
            for (var i in files) {
                self._scriptsToBeLoaded.push(files[i].name);
                if (files[i].fire) {
                    self._scriptsToBeFired.push(files[i].name);
                }
            }
            // Generate a request string
            var request = [];
            var needRequest = false;
            for (var index in self._scriptsToBeLoaded) {
                var script = self._scriptsToBeLoaded[index];
                // Only for scripts that we don't already have
                if ($.inArray(script, self._scripts) == -1) {
                    needRequest = true;
                    this.add(script);
                    request.push("scripts%5B%5D=" + script);
                }
            }
            request.push("call_done=1");
            // Download the composite js file, if necessary
            if (needRequest) {
                this.appendScript("js/get_scripts.js.php?" + request.join("&"));
            } else {
                self.done();
            }
        },
        /**
         * Called whenever all files are loaded
         *
         * @return void
         */
        done: function () {
            if (typeof ErrorReport !== 'undefined') {
                ErrorReport.wrap_global_functions();
            }
            for (var i in this._scriptsToBeFired) {
                AJAX.fireOnload(this._scriptsToBeFired[i]);
            }
            AJAX.active = false;
        },
        /**
         * Appends a script element to the head to load the scripts
         *
         * @return void
         */
        appendScript: function (url) {
            var head = document.head || document.getElementsByTagName('head')[0];
            var script = document.createElement('script');
            script.type = 'text/javascript';
            script.src = url;
            script.async = false;
            head.appendChild(script);
        },
        /**
         * Fires all the teardown event handlers for the current page
         * and rebinds all forms and links to the request handler
         *
         * @param function callback The callback to call after resetting
         *
         * @return void
         */
        reset: function (callback) {
            for (var i in this._scriptsToBeFired) {
                AJAX.fireTeardown(this._scriptsToBeFired[i]);
            }
            this._scriptsToBeFired = [];
            /**
             * Re-attach a generic event handler to clicks
             * on pages and submissions of forms
             */
            $(document).off('click', 'a').on('click', 'a', AJAX.requestHandler);
            $(document).off('submit', 'form').on('submit', 'form', AJAX.requestHandler);
            AJAX.cache.update();
            callback();
        }
    }
};

/**
 * Here we register a function that will remove the onsubmit event from all
 * forms that will be handled by the generic page loader. We then save this
 * event handler in the "jQuery data", so that we can fire it up later in
 * AJAX.requestHandler().
 *
 * See bug #3583316
 */
AJAX.registerOnload('functions.js', function () {
    // Registering the onload event for functions.js
    // ensures that it will be fired for all pages
    $('form').not('.ajax').not('.disableAjax').each(function () {
        if ($(this).attr('onsubmit')) {
            $(this).data('onsubmit', this.onsubmit).attr('onsubmit', '');
        }
    });

    /**
     * Workaround for passing submit button name,value on ajax form submit
     * by appending hidden element with submit button name and value.
     */
    $("#page_content").on('click', 'form input[type=submit]', function() {
        var buttonName = $(this).attr('name');
        if (typeof buttonName === 'undefined') {
            return;
        }
        $(this).closest('form').append($('<input/>', {
            'type' : 'hidden',
            'name' : buttonName,
            'value': $(this).val()
        }));
    });

    /**
     * Attach event listener to events when user modify visible
     * Input or Textarea fields to make changes in forms
     */
    $('#page_content').on(
        'keyup change',
        'form.lock-page textarea, ' +
        'form.lock-page input[type="text"]',
        AJAX.lockPageHandler
    );
    /**
     * Reset lock when lock-page form reset event is fired
     * Note: reset does not bubble in all browser so attach to
     * form directly.
     */
    $('form.lock-page').on('reset', function(event){
        AJAX.resetLock();
    });
});

/**
 * Unbind all event handlers before tearing down a page
 */
AJAX.registerTeardown('functions.js', function () {
    $('#page_content').off('keyup change',
        'form.lock-page textarea, ' +
        'form.lock-page input[type="text"]'
    );
    $('form.lock-page').off('reset');
});

/**
 * An implementation of a client-side page cache.
 * This object also uses the cache to provide a simple microhistory,
 * that is the ability to use the back and forward buttons in the browser
 */
AJAX.cache = {
    /**
     * @var int The maximum number of pages to keep in the cache
     */
    MAX: 6,
    /**
     * @var object A hash used to prime the cache with data about the initially
     *             loaded page. This is set in the footer, and then loaded
     *             by a double-queued event further down this file.
     */
    primer: {},
    /**
     * @var array Stores the content of the cached pages
     */
    pages: [],
    /**
     * @var int The index of the currently loaded page
     *          This is used to know at which point in the history we are
     */
    current: 0,
    /**
     * Saves a new page in the cache
     *
     * @param string hash    The hash part of the url that is being loaded
     * @param array  scripts A list of scripts that is required for the page
     * @param string menu    A hash that links to a menu stored
     *                       in a dedicated menu cache
     * @param array  params  A list of parameters used by PMA_commonParams()
     * @param string rel     A relationship to the current page:
     *                       'samepage': Forces the response to be treated as
     *                                   the same page as the current one
     *                       'newpage':  Forces the response to be treated as
     *                                   a new page
     *                       undefined:  Default behaviour, 'samepage' if the
     *                                   selflinks of the two pages are the same.
     *                                   'newpage' otherwise
     *
     * @return void
     */
    add: function (hash, scripts, menu, params, rel) {
        if (this.pages.length > AJAX.cache.MAX) {
            // Trim the cache, to the maximum number of allowed entries
            // This way we will have a cached menu for every page
            for (var i = 0; i < this.pages.length - this.MAX; i++) {
                delete this.pages[i];
            }
        }
        while (this.current < this.pages.length) {
            // trim the cache if we went back in the history
            // and are now going forward again
            this.pages.pop();
        }
        if (rel === 'newpage' ||
            (
                typeof rel === 'undefined' && (
                    typeof this.pages[this.current - 1] === 'undefined' ||
                    this.pages[this.current - 1].hash !== hash
                )
            )
        ) {
            this.pages.push({
                hash: hash,
                content: $('#page_content').html(),
                scripts: scripts,
                selflink: $('#selflink').html(),
                menu: menu,
                params: params
            });
            AJAX.setUrlHash(this.current, hash);
            this.current++;
        }
    },
    /**
     * Restores a page from the cache. This is called when the hash
     * part of the url changes and it's structure appears to be valid
     *
     * @param string index Which page from the history to load
     *
     * @return void
     */
    navigate: function (index) {
        if (typeof this.pages[index] === 'undefined' ||
            typeof this.pages[index].content === 'undefined' ||
            typeof this.pages[index].menu === 'undefined' ||
            ! AJAX.cache.menus.get(this.pages[index].menu)
        ) {
            PMA_ajaxShowMessage(
                '<div class="error">' + PMA_messages.strInvalidPage + '</div>',
                false
            );
        } else {
            AJAX.active = true;
            var record = this.pages[index];
            AJAX.scriptHandler.reset(function () {
                $('#page_content').html(record.content);
                $('#selflink').html(record.selflink);
                AJAX.cache.menus.replace(AJAX.cache.menus.get(record.menu));
                PMA_commonParams.setAll(record.params);
                AJAX.scriptHandler.load(record.scripts);
                AJAX.cache.current = ++index;
            });
        }
    },
    /**
     * Resaves the content of the current page in the cache.
     * Necessary in order not to show the user some outdated version of the page
     *
     * @return void
     */
    update: function () {
        var page = this.pages[this.current - 1];
        if (page) {
            page.content = $('#page_content').html();
        }
    },
    /**
     * @var object Dedicated menu cache
     */
    menus: {
        /**
         * Returns the number of items in an associative array
         *
         * @return int
         */
        size: function (obj) {
            var size = 0, key;
            for (key in obj) {
                if (obj.hasOwnProperty(key)) {
                    size++;
                }
            }
            return size;
        },
        /**
         * @var hash Stores the content of the cached menus
         */
        data: {},
        /**
         * Saves a new menu in the cache
         *
         * @param string hash    The hash (trimmed md5) of the menu to be saved
         * @param string content The HTML code of the menu to be saved
         *
         * @return void
         */
        add: function (hash, content) {
            if (this.size(this.data) > AJAX.cache.MAX) {
                // when the cache grows, we remove the oldest entry
                var oldest, key, init = 0;
                for (var i in this.data) {
                    if (this.data[i]) {
                        if (! init || this.data[i].timestamp.getTime() < oldest.getTime()) {
                            oldest = this.data[i].timestamp;
                            key = i;
                            init = 1;
                        }
                    }
                }
                delete this.data[key];
            }
            this.data[hash] = {
                content: content,
                timestamp: new Date()
            };
        },
        /**
         * Retrieves a menu given its hash
         *
         * @param string hash The hash of the menu to be retrieved
         *
         * @return string
         */
        get: function (hash) {
            if (this.data[hash]) {
                return this.data[hash].content;
            } else {
                // This should never happen as long as the number of stored menus
                // is larger or equal to the number of pages in the page cache
                return '';
            }
        },
        /**
         * Prepares part of the parameter string used during page requests,
         * this is necessary to tell the server which menus we have in the cache
         *
         * @return string
         */
        getRequestParam: function () {
            var param = '';
            var menuHashes = [];
            for (var i in this.data) {
                menuHashes.push(i);
            }
            var menuHashesParam = menuHashes.join('-');
            if (menuHashesParam) {
                param = '&menuHashes=' + menuHashesParam;
            }
            return param;
        },
        /**
         * Replaces the menu with new content
         *
         * @return void
         */
        replace: function (content) {
            $('#floating_menubar').html(content)
                // Remove duplicate wrapper
                // TODO: don't send it in the response
                .children().first().remove();
            $('#topmenu').menuResizer(PMA_mainMenuResizerCallback);
        }
    }
};

/**
 * URL hash management module.
 * Allows direct bookmarking and microhistory.
 */
AJAX.setUrlHash = (function (jQuery, window) {
    "use strict";
    /**
     * Indictaes whether we have already completed
     * the initialisation of the hash
     *
     * @access private
     */
    var ready = false;
    /**
     * Stores a hash that needed to be set when we were not ready
     *
     * @access private
     */
    var savedHash = "";
    /**
     * Flag to indicate if the change of hash was triggered
     * by a user pressing the back/forward button or if
     * the change was triggered internally
     *
     * @access private
     */
    var userChange = true;

    // Fix favicon disappearing in Firefox when setting location.hash
    function resetFavicon() {
        if (navigator.userAgent.indexOf('Firefox') > -1) {
            // Move the link tags for the favicon to the bottom
            // of the head element to force a reload of the favicon
            $('head > link[href=favicon\\.ico]').appendTo('head');
        }
    }

    /**
     * Sets the hash part of the URL
     *
     * @access public
     */
    function setUrlHash(index, hash) {
        /*
         * Known problem:
         * Setting hash leads to reload in webkit:
         * http://www.quirksmode.org/bugreports/archives/2005/05/Safari_13_visual_anomaly_with_windowlocationhref.html
         *
         * so we expect that users are not running an ancient Safari version
         */

        userChange = false;
        if (ready) {
            window.location.hash = "PMAURL-" + index + ":" + hash;
            resetFavicon();
        } else {
            savedHash = "PMAURL-" + index + ":" + hash;
        }
    }
    /**
     * Start initialisation
     */
    if (window.location.hash.substring(0, 8) == '#PMAURL-') {
        // We have a valid hash, let's redirect the user
        // to the page that it's pointing to
        var colon_position = window.location.hash.indexOf(':');
        var questionmark_position = window.location.hash.indexOf('?');
        if (colon_position != -1 && questionmark_position != -1 && colon_position < questionmark_position) {
            var hash_url = window.location.hash.substring(colon_position + 1, questionmark_position);
            if (PMA_gotoWhitelist.indexOf(hash_url) != -1) {
                window.location = window.location.hash.substring(
                    colon_position + 1
                );
            }
        }
    } else {
        // We don't have a valid hash, so we'll set it up
        // when the page finishes loading
        jQuery(function () {
            /* Check if we should set URL */
            if (savedHash !== "") {
                window.location.hash = savedHash;
                savedHash = "";
                resetFavicon();
            }
            // Indicate that we're done initialising
            ready = true;
        });
    }
    /**
     * Register an event handler for when the url hash changes
     */
    jQuery(function () {
        jQuery(window).hashchange(function () {
            if (userChange === false) {
                // Ignore internally triggered hash changes
                userChange = true;
            } else if (/^#PMAURL-\d+:/.test(window.location.hash)) {
                // Change page if the hash changed was triggered by a user action
                var index = window.location.hash.substring(
                    8, window.location.hash.indexOf(':')
                );
                AJAX.cache.navigate(index);
            }
        });
    });
    /**
     * Publicly exposes a reference to the otherwise private setUrlHash function
     */
    return setUrlHash;
})(jQuery, window);

/**
 * Page load event handler
 */
$(function () {
    // Add the menu from the initial page into the cache
    // The cache primer is set by the footer class
    if (AJAX.cache.primer.url) {
        AJAX.cache.menus.add(
            AJAX.cache.primer.menuHash,
            $('<div></div>')
                .append('<div></div>')
                .append($('#serverinfo').clone())
                .append($('#topmenucontainer').clone())
                .html()
        );
    }
    $(function () {
        // Queue up this event twice to make sure that we get a copy
        // of the page after all other onload events have been fired
        if (AJAX.cache.primer.url) {
            AJAX.cache.add(
                AJAX.cache.primer.url,
                AJAX.cache.primer.scripts,
                AJAX.cache.primer.menuHash
            );
        }
    });
});

/**
 * Attach a generic event handler to clicks
 * on pages and submissions of forms
 */
$(document).on('click', 'a', AJAX.requestHandler);
$(document).on('submit', 'form', AJAX.requestHandler);

/**
 * Gracefully handle fatal server errors
 * (e.g: 500 - Internal server error)
 */
$(document).ajaxError(function (event, request, settings) {
    if (request.status !== 0) { // Don't handle aborted requests
        var errorCode = PMA_sprintf(PMA_messages.strErrorCode, request.status);
        var errorText = PMA_sprintf(PMA_messages.strErrorText, request.statusText);
        PMA_ajaxShowMessage(
            '<div class="error">' +
            PMA_messages.strErrorProcessingRequest +
            '<div>' + escapeHtml(errorCode) + '</div>' +
            '<div>' + escapeHtml(errorText) + '</div>' +
            '</div>',
            false
        );
        AJAX.active = false;
    }
});
