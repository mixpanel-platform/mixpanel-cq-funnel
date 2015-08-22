(function() {
'use strict';

window.MPFunnelViewer = Backbone.View.extend({
    render: function() {
        console.log('render model = ' + this.model);
        this.graph = new FunnelGraph({model: this.model});
        this.graph.render();
        this.$el.html(this.graph.el);
    }
});

var FunnelGraph = Backbone.View.extend({
    templates: {
        "base": "#tpl_graph",
        "line": "#tpl_graph_line",
        "columns": "#tpl_graph_columns",
        "trends": "#tpl_graph_trends"
    },

    events: {
        "click .column": 'select_event',
        "click .overview_button": 'select_overview',
        "click .trend": 'show_trend_overlay'
    },

    // template helpers
    helpers: {
        step_conv_ratio: function(step) {
            // return mp.utility.round(step.step_conv_ratio * 100, 2);
            return '---';
        },
        overall_steps: function() {
            return this._model.get_overall_steps();
        },
        commaize: mp.utility.commaize,
        truncate: mp.utility.truncate_middle,
        rename_mp_event: mp.utility.rename_mp_event
    },

    // handler for clicking on .column
    select_event: function(e) {
        var column_button = $(e.currentTarget).find('.column_button'),
            event_index = column_button.attr('data-index');
        // this.session.viewer.set('event_index', Number(event_index));
    },

    // handler for clicking on .overview_button
    select_overview: function() {
        // this.session.viewer.set('event_index', null);
    },

    show_trend_overlay: function(e) {
        var event_index = $(e.currentTarget).attr('data-index');

        var resize_modal = function() {
            this.trend_modal.resize();
            this.model.off(null, resize_modal);
        };

        this.model.on('change:unit', resize_modal, this);
        this.trend_modal.show();
        this.trend_modal.widget.show_event_index(Number(event_index));
        this.trend_modal.resize();
    },

    constructor: function() {
        // operate directly on the prototype, so the templates are
        // only compiled once
        var proto = this.constructor.prototype;

        _.each(proto.templates, function(template, key) {
            // we only compile strings, if it's not a string we
            // assume that the user is defining their own template
            // (probably their own function)
            if (_.isString(template)) {
                proto.templates[key] = compile_template(template);
            }
        });

        Backbone.View.prototype.constructor.apply(this, arguments);
    },

    initialize: function() {
        this.on_close(this.unload);
    },

    load: function(funnel) {
        this.unload();
        this.model = funnel;

        if (!this.initial_render) {
            this.render();
            this.initial_render = true;
        }

        this.update(); // load whatever data is in the funnel right away
        this.stepper.load(this.model); // update the stepper with the new funnel
        this.trend_modal.widget.load(this.model); // update the trend modal window
        this.template_model_bindings(); // bind handlers for future data
    },

    unload: function() {
        if (this.model) { this.model.off(null, null, this); }
    },

    render: function() {
        this.$el.addClass('graph block').html(this.render_template('base'));
        this.hide_message();
        this.template_model_bindings();

        // this.render_date_picker();
        // this.render_stepper();
        // this.render_trend_overlay();
    },

    render_template: function(name, extra_context) {
        var model = _.isUndefined(this.model) ? {} : this.model.toJSON(),
            context = _.extend({
                model: model,           // serialized representation of the model
                _model: this.model,     // actual model
                partial: this.partial_helper(extra_context)
            }, this.helpers, extra_context);

        return this.templates[name](context);
    },

    // generate a helper to render partials with the current context
    partial_helper: function(extra_context) {
        return _.bind(function(name, context) {
            return this.render_template(name, _.extend(extra_context, context));
        }, this);
    },

    render_date_picker: function() {
        this.date_picker = new mp.widgets.DatePicker().create(
            this.$('#date_selector'),
            [
                new DateRange(new RelativeDate(0), "Today"),
                new DateRange(new RelativeDate(-1), new RelativeDate(-1), "Yesterday"),
                new DateRange(new RelativeDate(-6), "Past week"),
                new DateRange(new RelativeDate(-29), "Past 30 days"),
                new DateRange(new RelativeDate(-89), "Past 90 days")
            ]
        );
        this.date_picker.set_max_days(89);
        this.date_picker.set_limits(new Date(2011, 6, 11), mp.utility.to_localized_date(new Date()));
        this.update_date_picker();

        this.date_picker.onchange(_.bind(function(date_range) {
            // this.session.viewer.set('date_range', date_range);
        }, this));
    },

    render_stepper: function() {
        this.stepper = new ns.Stepper({ el: this.$('.stepper') });
    },

    render_trend_overlay: function() {
        this.trend_modal = new Backbone.widgets.ModalWindow({
            widget: new ns.ConversionGraph({ overlay: true, width: 900 }),
            width: 900
        });
    },

    template_model_bindings: function() {
        this.model.on('change:data', this.update, this);
        this.model.on('change:finish_rate', this.update_finish_rate, this);
        this.model.on('error', this.show_error, this);
        this.model.on('loading:data', this.show_loader, this);
        this.model.on('loaded:data', this.hide_message, this);

        // this.session.viewer.on('change:start_step', this.update_start_step, this);
        // this.session.viewer.on('change:event_index', this.select_column, this);
    },

    select_column: function() {
        var index = 0; //this.session.viewer.get('event_index');

        if (_.isNull(index)) {
            this.$('.columns .active').removeClass('active');
            this.$('.overview_button').addClass('active');
        } else {
            this.$('.columns .active').removeClass('active');
            this.$('.overview_button').removeClass('active');

            var column_button = this.$(_.sprintf('.column_button[data-index="%d"]', index)),
                column = column_button.parent();
            column.addClass('active');
            column_button.addClass('active');
        }
    },

    show_loader: function() {
        this.show_message('loading');
    },

    show_error: function() {
        this.show_message('error', this.model.get("error"));
    },

    update_start_step: function(anim_speed) {
        var start_step = 0; //this.session.viewer.get('start_step');

        if (!_.isNumber(anim_speed)) {
            anim_speed = 300;
        }

        this.$('.inner_wrap').stop(true).animate({
            scrollLeft: start_step * this._step_width
        }, anim_speed);

        this.$('.trends .trend').stop(true).each(function(index) {
            if (index < start_step || index >= start_step + 4) {
                $(this).animate({ opacity: 0 }, anim_speed);
            } else {
                $(this).animate({ opacity: 1 }, anim_speed);
            }
        });
    },

    update_date_picker: function() {
        // this.date_picker.set_dates(this.session.viewer.get('date_range'), true);
    },

    // called on every model data change
    update: function() {
        var steps = this.model.get_overall_steps();

        if (steps.length === 0) {
            this.show_message('loading');
        } else if (!this.model.get('has_overall_data')) {
            this.show_message('no_data');
        } else {
            this.hide_message();
        }

        this.update_finish_rate();
        this.update_y_axis(steps);
        this.update_columns(steps);
        this.update_trends(steps);

        // update the date picker
        this.update_date_picker();
        this.update_start_step();

        var table_data = _.map(
            this.model.overall, function(step) {
                return '--- ' + step.event + ' ---<br>' + _.map(
                    _.sortBy(_.keys(step.next), function(k) {
                        return -step.next[k]
                    }),
                    function(k) {
                        return step.next[k] + ': ' + k + '<br>';
                    });
            })
            .join('<br>');
        this.$el.append(
            '<div class="dropoff">' +
                'WHAT DID PEOPLE DO AFTER DROPPING OFF?<br><br>' +
                table_data +
            '</div>'
        );
    },

    show_message: function(type, extra) {
        var notes = this.$('.notes').show();
        this.$('.note').hide();
        var note = this.$('.note.'+type).show();

        if (type !== "loading") {
            this.$('.overview_button').hide();
        }

        if (type === "error") {
            note.find('h2').html(extra);
        }

        note.css({
            top: notes.height() / 2 - note.outerHeight() / 2,
            left: notes.width() / 2 - note.outerWidth() / 2
        });

        this.$('.button_blocker').show();
    },

    hide_message: function() {
        this.$('.notes').hide();
        this.$('.button_blocker').hide();
        this.$('.overview_button').show();
    },

    update_finish_rate: function() {
        this.$('.header .finish_rate').text(this.model.get('finish_rate'));
    },

    update_y_axis: function(steps) {
        var y_axis = this.$('.body.data .y_axis'),
            step_size, num_steps, margin_top, height;

        if (steps.length > 0 && steps[0].count > 0) {
            step_size = this.compute_y_interval(steps);
            num_steps = Math.min(Math.floor(steps[0].count / step_size), 6);
            // .columns has a padding top of 30
            // .y_axis has a height of 395
            margin_top = 30 + (395-30) * (1 - num_steps * step_size / steps[0].count);
        } else {
            step_size = NaN;
            num_steps = 6;
            margin_top = 30;
        }
        height = (395 - margin_top) / num_steps;

        y_axis.empty();
        for (var i = 0; i < num_steps; i++) {
            var line = this.render_template('line', {
                amt: step_size ? mp.utility.pretty_number((i + 1) * step_size) : '&nbsp;',
                height: height
            });
            y_axis.prepend(line);
        }
        y_axis.children().first().css('margin-top', margin_top);
    },

    compute_y_interval: function(steps) {
        var max_users = steps[0].count;
        if (max_users === 0) {
            return 0;
        } else if (max_users < 5) {
            return max_users + max_users % 2;
        }

        // Create nice intervals that take advantage of the fact that there are 6
        // visible subdivisions on the y axis.
        var interval = max_users / 7;

        // Determine a nice interval thats some power of 10 multiple of 1, 2, or 5
        var exp = Math.floor(Math.log(interval) / Math.log(10));
        var f = interval / Math.pow(10, exp);
        var nice_interval;
        if (f < 1.1) {
            nice_interval = Math.pow(10, exp);
        } else if (f <= 2) {
            nice_interval = 2 * Math.pow(10, exp);
        } else if (f <= 3) {
            nice_interval = 3 * Math.pow(10, exp);
        } else if (f <= 5) {
            nice_interval = 5 * Math.pow(10, exp);
        } else {
            nice_interval = Math.pow(10, exp + 1);
        }

        // Let the first label be the next nice_interval greater than max_users
        return nice_interval;
    },

    update_columns: function(steps) {
        if (steps.length === 0 || !this.model.get('has_overall_data')) {
            this.$('.columns').html("");
            return;
        }

        var max_count = steps[0].count,
            $columns = this.$('.columns');

        var context = {
            get_height: function(step) {
                var height = Math.max(1, (step.count / max_count) * 100);
                if (_.isNaN(height)) { height = 1; }
                return _.sprintf('top: %f%%; height: %f%%;', 100 - height, height);
            }
        };

        $columns.html(this.render_template('columns', context));
        this._step_width = $columns.find('.column').outerWidth(true);
        $columns.width(this._step_width * steps.length + 10);
        this.$('.column_button').each(function() {
            var el = $(this),
                column_width = 60;
            el.css('left', -1 * ((el.outerWidth() - column_width) / 2));
        });

        // ensure correct column has been selected
        this.select_column();
    },

    update_trends: function(steps) {
        if (steps.length === 0 || steps[0].count === 0) {
            this.$('.trends').html("");
        } else {
            this.$('.trends').html(this.render_template('trends'));
        }
    }
});

var compile_template = function(template) {
    var src = "";
    if (_.isFunction(template)) {
        // template has already been compiled
        return template;
    } else if (template[0] === '#') {
        // template is an id, find it in the dom
        var query = $(_.sprintf("%s[type='text/template']", template));

        if (query.length == 0) {
            throw Error("TemplateView: No template found with id = " + template);
        } else if (query.length > 1) {
            throw Error("TemplateView: More than one template found with id = " + template);
        }

        src = query.text();
    } else {
        // template is a inline string, just compile it
        src = template;
    }

    return _.template(src, null, { variable: 'd' });
}

})();
