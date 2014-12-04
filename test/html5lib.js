var fs = require('fs');
var through = require('through2')
var test = require('tape');
var tokenize = require('html-tokenize');
var nest = require('../');
var parse_tag = require('../parse_tag.js')

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
var limit = 40
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
    var n;
    if (desc['document-fragment']) {
      n = nest({ context: desc['document-fragment'].pop() });
    } else {
      n = nest();
    }
    var tok = tokenize();

    while(line=desc.data.shift()){
      tok.write(line);
    }
    tok.end()


    var more_text = false;
    var pending_text = '';
    var exp;
    tok.pipe(n).pipe(through.obj(function(row,_,next) {
      if (more_text) {
        //t.equal(row[0], 'text', 'more text');
      } else {
        exp = expected.shift();
        t.equal(row[0], exp[0]);
      }

      var exp_name = exp[1];
      var act_name = row[1].toString();
      var id_attrs = true;
      var tt;
      if (row[0] === 'open') {
        var exp_tag = parse_tag(exp[1]);
        var act_tag = parse_tag(row[1]);
        var exp_attr = exp_tag.getAttributes();
        var act_attr = act_tag.getAttributes();
        for (var a in exp_attr) {
          if (exp_attr[a] !== act_attr[a]) is_attrs = false;
        }
        for (var a in act_attr) {
          if (exp_attr[a] !== act_attr[a]) is_attrs = false;
        }
        exp_name = exp_tag.name;
        act_name = act_tag.name.toLowerCase();
        tt = id_attrs && (act_name === exp_name);
      }
      else if (row[0] === 'close') {
        tt = (act_name === exp_name);
      } 
      else {
        pending_text += act_name;
        more_text = pending_text.length !== exp_name.length;
        //console.log(more_text, pending_text, exp_name)
        tt = pending_text === exp_name;
        if (!more_text) {
          pending_text = '';
        }
      }

      if (!more_text) {
        t.equal(true, tt, 'act:'+row[1].toString() + ' <-> ' + 'exp:' + exp[1]); 
      }
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
    } else {
      // this is an attribute
      tokens[tokens.length-1][1]=
      tokens[tokens.length-1][1].substr(0, tokens[tokens.length-1][1].length-1)
      + ' ' + line + '>'
    }
  }
  while (name = stack.pop()) {
    if (velements.indexOf(name) === -1) {
      tokens.push(['close', '</'+name+'>'])
    }
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
