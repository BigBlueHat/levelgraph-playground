var Vue = require('vue');
var CodeMirror = require('codemirror');
require('codemirror/mode/javascript/javascript');
require('codemirror/mode/turtle/turtle');

var levelgraph = require('levelgraph');
var leveljs = require('level-js');
var levelup = require('levelup');
var levelgraphJSONLD = require('levelgraph-jsonld');
var levelgraphN3 = require('levelgraph-n3');

var factory = function (location) { return new leveljs(location) };

var db = levelgraphN3(
  levelgraphJSONLD(
    levelgraph(
      levelup('levelgraph-playgrond', {db: factory})
    ),
    {base: '_:'} // yeah...storing unknown @id's as blank nodes...appologies to the future...
  )
);
window.db = db;

var default_jsonld = JSON.stringify({
  "@context": {
    "@vocab": "http://xmlns.com/foaf/0.1/",
  },
  "@id": "http://bigbluehat.com/#",
  "name": "BigBlueHat",
  "knows": [
    {
      "@id": "http://manu.sporny.org#person",
      "name": "Manu Sporny",
      "homepage": "http://manu.sporny.org/"
    }
  ]
}, null, 2);

var default_n3 = '@prefix foaf: <http://xmlns.com/foaf/0.1/>.\n\n'
+ '<http://bigbluehat.com/#>\n'
+ '  foaf:name "BigBlueHat" ;\n'
+ '  foaf:workHomepage "http://wiley.com/" ;\n'
+ '  foaf:knows <https://www.w3.org/People/Berners-Lee/card#i>.'

Vue.component('code-mirror', {
  template: '<textarea v-model="code"></textarea>',
  data: function() {
    return {
      value: ''
    };
  },
  props: {
    code: String,
    options: {
      type: Object,
      default: function() {
        return {
          lineNumbers: true
        };
      }
    }
  },
  created: function() {
    // merge in default options
    // TODO: find a way to get at the defaults defined above
    if (!('lineNumbers' in this.options)) {
      this.options.lineNumbers = true;
    }
  },
  mounted: function() {
    var self = this;
    this.editor = CodeMirror.fromTextArea(this.$el, this.options);
    this.editor.setValue(this.code);
    this.editor.on('change', function(cm) {
      self.value = cm.getValue();
    });
  },
  methods: {
    refresh: function() {
      this.editor.refresh();
    }
  }
});

new Vue({
  el: '#app',
  data: {
    input: {
      jsonld: default_jsonld,
      n3: default_n3
    },
    table: [],
    filter: {
      subject: '',
      predicate: '',
      object: ''
    },
    current_tab: 'json-ld'
  },
  watch: {
    current_tab: function(v) {
      var self = this;
      // DOM changing...wait for it...
      Vue.nextTick(function() {
        // TODO: ugh...context leakage...nasty stuff
        self.$refs[self.input_type].refresh();
      });
    }
  },
  computed: {
    actual_filter: function() {
      var object = this.filter.object.trim();
      if (object !== '' && !isNaN(object)) {
        // search for the RDF materialized integer
        object = '"' + String(object) + '"^^http://www.w3.org/2001/XMLSchema#integer';
      }
      var spo = {
        subject: this.filter.subject.trim(),
        predicate: this.filter.predicate.trim(),
        object: object
      };

      // TODO: certainly  there's a better way to "clean" this object...later...maybe
      if (spo.subject === '') delete spo.subject;
      if (spo.predicate === '') delete spo.predicate;
      if (spo.object === '') delete spo.object;

      return spo;
    },
    input_type: function() {
      if (this.current_tab === 'json-ld') {
        return 'jsonld';
      } else if (this.current_tab === 'n3') {
        return 'n3';
      } else {
        throw Error('Hrm...current_tab got messed up somehow...');
      }
    }
  },
  created: function() {
    this.displayTriples({});
  },
  methods: {
    displayTriples: function(spo) {
      var self = this;
      db.get(spo, function(err, list) {
        self.table = list;
      });
    },
    put: function() {
      var self = this;
      // TODO: refs are handy, but this feels "off"
      db[this.input_type].put(this.$refs[this.input_type].value, function(err, obj) {
        // do something after the obj is inserted
        self.displayTriples({});
      });
    },
    applyFilter: function() {
      this.displayTriples(this.actual_filter);
    },
    changeTab: function(tab) {
      this.current_tab = tab;
    },
    setFilter: function(spo) {
      // TODO: add some error handling and such
      this.filter.subject = spo.subject;
      this.filter.predicate = spo.predicate;
      this.filter.object = spo.object;
    },
    addSPO: function() {
      var self = this;
      db.put(self.filter, function(err) {
        if (err) {
          console.error(err);
        } else {
          self.table.unshift(self.filter);
          self.filter = {
            subject: '',
            predicate: '',
            object: ''
          };
          self.applyFilter();
        }
      });
    },
    removeSPO: function(spo, idx) {
      var self = this;
      // remove it from the database
      db.del(spo, function(err) {
        if (err) {
          console.error(err);
        } else {
          // remove it from the page/app state
          self.table.splice(idx, 1);
        }
      });
      // TODO: switch to the changes feed once that's a thing
    }
  }
});
