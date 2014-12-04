var fs = require('fs');
var through = require('through2')
var test = require('tape');
var tokenize = require('html-tokenize');
var nest = require('../');

var dat = fs.createReadStream(__dirname + '/html5lib-tests/tree-construction/tests7.dat');

var left;
var liner = through(function(row, enc, next) {
  var lines = row.toString().split(/[\n\r]/g);
  var line;
  left = (left !== undefined ? left : '') + lines.shift();
  this.push(left);
  left = lines.pop();
  while ((line = lines.shift()) !== undefined) {
    this.push(line ? line : '---end---');
  }
  next();
}, function(next) {
  if (left !== undefined) {
    this.push(left);
  }
  next()
})

var state;
var buf;
var idx=0;
var o;
var parser = through(function(row, enc, next) {
  var line = row.toString();
  if (line === '#data') {
    state = 'data';
    idx++
    o = { index: idx, script: 'both' };
    buf = [];
  }
  else if (line === '#errors') {
    o[state] = buf;
    state = 'errors';
    buf = [];
  }
  else if (line === '#document') {
    o[state] = buf;
    state = 'document';
    buf = [];
  }
  else if (line === '#document-fragment') {
    o[state] = buf;
    state = 'document-fragment';
    buf = [];
  }
  else if (line === '#script-on') {
    o.script = 'on';
  }
  else if (line === '#script-off') {
    o.script = 'off';
  }

  else if (line === '---end---') {
    o.document = buf;
    buf = [];
    addTest(o);
  }
  else {
    buf.push(line);
  }
  next()
}, function(next) {
  o.document = buf;
  buf = [];
  addTest(o);
  o = {};
})

var velements = [ 'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'keygen', 'link', 'menuitem', 'meta', 'param', 'source', 'track', 'wbr'];
var num = 0;
var limit = 13;
function addTest(desc) {
  num++;
  if (num > limit) return;
  var testName = 't' + num + ': ' + desc.data.join(';');
  test(testName, function(t) {
    
    console.log(testName);
    console.log(desc.document);
    var line;

    var expected = getTokens(desc.document);
    console.log(expected)

    t.plan(2*expected.length)
    var n = nest();
    var tok = tokenize();

    while(line=desc.data.shift()){
      tok.write(line);
    }
    tok.end()

    tok.pipe(n).pipe(through.obj(function(row,_,next) {
      var exp = expected.shift();
      t.equal(row[0], exp[0]);
      var actual = row[1].toString();
      if (row[0] === 'open') {
        actual = actual.toLowerCase();
      }
      t.equal(actual, exp[1], row[1].toString() + ' <-> ' + exp[1]); 
      next();
    }))

  })
}

function getTokens(doc) {
  var line;
  var pos;
  var stack = [];
  var tokens = [];
  while(line = doc.shift()) {
    line = line.substr(2);
    // calculate stack position
    pos = 0;
    while (line.substr(0,2) === '  ') {
      pos++
      line = line.substr(2);
    }
    if (line.toLowerCase().substr(0,9) === '<!doctype') {
      tokens.push(['open', line.toLowerCase()])
    }
    else if (line.substr(0,1) === '<') {
      while (pos < stack.length) {
        var name = stack.pop();
        if (velements.indexOf(name) === -1) {
          tokens.push(['close', '</'+name+'>'])
        }
      }
      if (pos === stack.length) {
        tokens.push(['open', line]);
        stack.push(getName(line))
      } else {
        console.log('FATAL');
      }
    }
    else if (line.substr(0,1) === '"') {
      while (pos < stack.length) {
        var name = stack.pop();
        if (velements.indexOf(name) === -1) {
          tokens.push(['close', '</'+name+'>'])
        }
      }
      if (pos === stack.length) {
        tokens.push(['text', line.substr(1,line.length-2)]);
      } else {
        console.log('FATAL');
      }
    }
  }
  while (name = stack.pop()) {
    tokens.push(['close', '</'+name+'>'])
  }
  return tokens;
}

function getName(buf) {
    if (typeof buf === 'string') buf = Buffer(buf);

    var closing = buf[1] === '/'.charCodeAt(0);
    var start = closing ? 2 : 1;
    var name;

    for (var i = start; i < buf.length; i++) {
        var c = String.fromCharCode(buf[i]);
        if (/[\s>\/]/.test(c)) {
            break;
        }
    }
    name = buf.slice(start, i).toString('utf8').toLowerCase();
    return name;
};

dat.pipe(liner).pipe(parser).resume()
