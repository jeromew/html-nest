var fs = require('fs');
var nest = require('../');
var test = require('tape');
var through = require('through2');
var glob = require('glob');

var suite = {};
var tests = glob.sync('*.json', { cwd: __dirname })
tests.forEach(function(file) {
  var t = require('./'+file);
  for (var name in t) {
    suite['('+file + ') ' + name] = t[name];
  }
})

for(var name in suite) { 
  if (suite.hasOwnProperty(name)) {
    (function(name) {
      var io = suite[name];
      test(name, function(t) {
        t.plan(io.output.length * 2)
        var n = nest();
        n.pipe(through.obj(function(row, _, next) {
          var exp = io.output.shift();
          t.equal(row[0], exp[0]);
          t.equal(row[1].toString(), exp[1]);
          next();
        }))
        var token;
        while (token = io.input.shift()) {
          n.write(token);
        }
        n.end();
      });
    })(name);
  }
}

