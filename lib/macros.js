var _ = require("lodash");

function identity(v) {
  return v;
}
function yes() {
  return true;
}

function Macros(options) {
  options = options || {};

  this.valueFn = options.valueFn || identity;
  this.canEvalItem = options.canEvalItem || yes;

  this.defTable = {};
}

Macros.prototype = {
  isDefined: function(name) {
    var n = this.valueFn(name);
    return this.defTable.hasOwnProperty(n);
  },

  undef: function(name) {
    var n = this.valueFn(name);
    delete this.defTable[n];
    return this;
  },

  define: function(name, values) {
    var n = this.valueFn(name);
    this.defTable[n] = values;
    return this;
  },

  evaluate: function(name) {
    return this._eval(name, {});
  },

  _eval: function(name, visited) {
    var n = this.valueFn(name);

    if (visited[n]) {
      throw Error(
        name + " appears to be a recursive macro which can't be evaluated."
      );
    }
    visited[n] = true;

    var macroVals = this.defTable[n],
      results = [];

    if (typeof macroVals !== "undefined") {
      if (!_.isArray(macroVals)) {
        macroVals = [macroVals];
      }

      var temp = macroVals.map(function(val, k) {
        return this.canEvalItem(val) && this.isDefined(val)
          ? this._eval(val, visited)
          : val;
      }, this);

      var i = -1,
        len = temp.length;
      while (++i < len) {
        var a = temp[i];
        if (!_.isArray(a)) {
          results.push(a);
        } else {
          results.push.apply(results, a);
        }
      }
    }

    return results;
  }
};

module.exports = Macros;
