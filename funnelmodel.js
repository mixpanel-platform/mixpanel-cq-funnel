(function() {
'use strict';

window.MPFunnelModel = Backbone.Model.extend({
    defaults: {
        finish_rate: 0,
        segment: null,
        filter: null,
        numeric: false,
        events: []
    },

    overall: [],
    segment: [],
    unit: {},

    setData: function(response) {
        var //date_range = mp.report.funnels.session.viewer.get('date_range'),
            segment = this.get('segment'),
            filter = this.get('filter'),
            numeric = this.get('numeric'),
            params = _.extend({
                funnel_id: this.id,
                //from_date: date_range.from().toString(mp.utility.default_date_format),
                //to_date: date_range.to().toString(mp.utility.default_date_format),
                limit: 200,
                on: segment,
                where: filter,
                length: null, //this.session.viewer.get('length') || null,
                length_unit: null, //this.session.viewer.get('length_unit') || null
            }, {}); // override_params);

        // clear any params that have falsy values
        for (var key in params) { if (!params[key]) { delete params[key]; } }

        if (_.has(params, "unit") || !params.on) { numeric = false; }
        if (!_.has(params, "unit")) { params.interval = 30; } //date_range.days(); }




        var data = _.values(response.data);
        if (data.length <= 1) {
            this._load_data(data[0], params);
        } else {
            this._load_unit_data(response.data, params);
        }
    },

    get_overall_steps: function() { return this.overall; },
    get_segment_steps: function() { return this.segment; },

    clear_unit_steps: function() { this.unit = {}; },
    get_unit_steps: function(unit) { return this.unit[unit]; },
    set_unit_steps: function(unit, steps) {
        this.unit[unit] = steps;
        this.trigger('loaded loaded:unit');
        this.trigger('change change:unit');
    },

    compute_finish_rate: function() {
        var steps = this.get_overall_steps();

        var max_c = steps[0].count || 1,        // if max steps is 0, then none of the steps will be more than 0
            last_c = steps[steps.length-1].count,
            finish_rate = mp.utility.round(last_c / max_c * 100, 2);

        this.set('finish_rate', finish_rate);
    },

    _load_data: function(data, params) {
        var overall_data = this.overall,
            segment_data = [];

        if (_.has(params, 'on')) {
            if (!data) {
                // construct a list of empty steps
                overall_data = _.map(this.get('events'), function(event, i) {
                    return {
                        event: event,
                        count: 0,
                        overall_conv_ratio: (i === 0 ? 1 : 0),
                        step_conv_ratio: (i === 0 ? 1 : 0),
                        avg_time: null
                    };
                });
            } else if (_.has(data, '$overall')) {
                overall_data = data.$overall;
                delete data.$overall;
            }

            segment_data = _.map(data, function(steps, prop) {
                steps = this._update_step_indices(steps);
                return { prop: prop, steps: steps };
            }, this);
        } else {
            overall_data = data.steps;
        }

        overall_data = this._update_step_indices(overall_data);

        console.log('...overall steps:', overall_data);
        console.log('...segment steps:', segment_data);

        //update top_properties events list
        var top_property_events = [];
        _.each(overall_data, function(step) {
            top_property_events.push(step.event);
        });
        this.set('top_property_events', top_property_events);

        // update events list
        this.set('events', _.pluck(overall_data, 'event'));

        this.overall = overall_data;
        this.segment = segment_data;

        // has_overall_data keeps track of whether or not we have
        // any data in the funnel even if we didn't filter
        // Note: we don't handle the case of the user specifying a
        // filter since we currently have no way of knowing if there
        // is data (outside of the filter) without sending a second
        // request to the server
        var has_overall_data = this.get('has_overall_data');
        if (!_.has(params, 'where')) {
            if (_.has(params, 'on')) {
                // segment query
                has_overall_data = !!data;
            } else {
                // regular query
                has_overall_data = overall_data[0].count > 0;
            }
        }
        this.set('has_overall_data', has_overall_data);

        this.trigger('loaded loaded:data');
        this.trigger('change change:data');

        this.compute_finish_rate();
    },

    _load_unit_data: function(response_data, params) {
        var unit_data  = _.map(response_data, function(data, date) {
            var steps = this._update_step_indices(data.steps);
            return { date: new Date(date), steps: steps };
        }, this);

        console.log('...unit steps:', unit_data);

        this.set_unit_steps(params.unit, unit_data);
    },

    _update_step_indices: function(steps) {
        return _.map(steps, function(step, i) {
            step.index = i;
            return step;
        });
    }
});

})();
