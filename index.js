var Transform = require('readable-stream').Transform;
var inherits = require('inherits');

inherits(Nest, Transform);
module.exports = Nest;

var remove = [
  '?xml:namespace' // found in docs where microsoft word fragments were copy/pasted
]


var tags = {
  // this is html-tokenize specific
  'comment':
    ['-', '!--'],

  // https://html.spec.whatwg.org/multipage/syntax.html#formatting
  'formatting':
    [ 'a', 'b', 'big', 'code', 'em', 'font', 'i', 'nobr', 's',
    'small', 'strike', 'strong', 'tt', 'u' ],

  // https://html.spec.whatwg.org/multipage/syntax.html#special
  'special':
    [ 'address', 'applet', 'area', 'article', 'aside', 'base', 'basefont',
    'bgsound', 'blockquote', 'body', 'br', 'button', 'caption', 'center', 'col',
    'colgroup', 'dd', 'details', 'dir', 'div', 'dl', 'dt', 'embed', 'fieldset',
    'figcaption', 'figure', 'footer', 'form', 'frame', 'frameset', 'h1', 'h2', 'h3',
    'h4', 'h5', 'h6', 'head', 'header', 'hgroup', 'hr', 'html', 'iframe', 'img', 'input',
    'isindex', 'li', 'link', 'listing', 'main', 'marquee', 'menu', 'menuitem', 'meta',
    'nav', 'noembed', 'noframes', 'noscript', 'object', 'ol', 'p', 'param', 'plaintext',
    'pre', 'script', 'section', 'select', 'source', 'style', 'summary', 'table', 'tbody',
    'td', 'template', 'textarea', 'tfoot', 'th', 'thead', 'title', 'tr', 'track', 'ul',
    'wbr', 'xmp' ],

  // https://html.spec.whatwg.org/multipage/syntax.html#void-elements
  'void-elements':
    [ 'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'keygen', 'link',
    'menuitem', 'meta', 'param', 'source', 'track', 'wbr'],

  // https://html.spec.whatwg.org/multipage/syntax.html#parsing-main-inbody
  'in_body_end_tags':
    [ 'address', 'article', 'aside', 'blockquote', 'button',
    'center', 'details', 'dialog', 'dir', 'div', 'dl', 'fieldset', 'figcaption',
    'figure', 'footer', 'header', 'hgroup', 'listing', 'main', 'menu', 'nav',
    'ol', 'pre', 'section', 'summary', 'ul' ],
}


function Nest () {
    if (!(this instanceof Nest)) return new Nest;
    Transform.call(this);
    this._writableState.objectMode = true;
    this._readableState.objectMode = true;
    this.insertion_mode = 'initial';
    this.stack = [];
    this.head_element_pointer = false;
    this.form_element_pointer = false;
}

/**
 * The insertion mode is a state modeled after 
 * https://html.spec.whatwg.org/multipage/syntax.html#insertion-mode
 *
 * initial: doctype definition
 */

Nest.prototype._transform = function (token, enc, next) {
  var reprocess;

  // early exit for text nodes
  if (token[0] === 'text') {
    this.push(token);
    next();
    return;
  } 

  // from now on we only have open/close tokens
  
  while (reprocess = this.process(token)) {}
  next();
}

// https://html.spec.whatwg.org/multipage/syntax.html#the-initial-insertion-mode
Nest.prototype.process_initial = function(name, token) {
  if (token[0] === 'open'
  && name === '!doctype') {
    this.insertion_mode = 'before_html';
    this.push(token);
  } else {
    this.insertion_mode = 'before_html';
    return true; 
  }
}

// https://html.spec.whatwg.org/multipage/syntax.html#the-before-html-insertion-mode
Nest.prototype.process_before_html = function(name, token) {
  if (token[0] === 'open'
  && name === '!doctype') {
    // Ignore token
  }
  else if (token[0] === 'open'
  && name === 'html') {
    this.stack.push(name);
    this.push(token);
    this.insertion_mode = 'before_head';
    return false;
  }
  else if (token[0] === 'close'
  && ['head', 'body', 'html', 'br' ].indexOf(name) === -1) {
    // Parse error. Ignore the token.
    return false;
  }
  else {
    this.stack.push('html');
    this.push(['open', Buffer('<html>')]);
    this.insertion_mode = 'before_head';
    return true; // reprocess the token
  }
}

// https://html.spec.whatwg.org/multipage/syntax.html#the-before-head-insertion-mode
Nest.prototype.process_before_head = function(name, token) {
  if (token[0] === 'open'
  && name === '!doctype') {
    // Ignore token
  }
  else if (token[0] === 'open'
  && name === 'html') {
    return this.process_in_body(name, token);
  }
  else if (token[0] === 'open'
  && name === 'head') {
    this.stack.push(name);
    this.push(token);
    this.head_element_pointer = true;
    this.insertion_mode = 'in_head';
    return false;
  }
  else if (token[0] === 'close'
  && ['head', 'body', 'html', 'br' ].indexOf(name) === -1) {
    // Parse error. Ignore the token.
    return false;
  }
  else {
    this.stack.push('head');
    this.push(['open', Buffer('<head>')]);
    this.insertion_mode = 'in_head';
    return true; // reprocess the token
  }
}

// https://html.spec.whatwg.org/multipage/syntax.html#parsing-main-inhead
Nest.prototype.process_in_head = function(name, token) {
  if (token[0] === 'open'
  && name === '!doctype') {
    // Ignore token
  }
  else if (token[0] === 'open'
  && name === 'html') {
    return this.process_in_body(name, token);
  }
  else if (token[0] === 'open'
  && ['base', 'basefont', 'bgsound', 'link', 'meta'].indexOf(name) !== -1) {
    this.push(token);
  }
  else if (name === 'title') {
    // Follow the generic RCDATA element parsing algorithm
    // TODO: The current implementation (expect <title> and </title>) is too simple compared 
    // to the RCDATA algorithm
    this.push(token);
  }
  else if (['noscript', 'noframes', 'style', 'script'].indexOf(name) !== -1) {
    // TODO: The current implementation expects balanced tags
    this.push(token);
  }
  else if (token[0] === 'close'
  && name === 'head') {
    this.stack.pop();
    this.push(token);
    this.insertion_mode = 'after_head';
  }
  else if (name === 'template') {
    // TODO: implement html5 template handling
    this.push(token);
  }
  else if (token[0] === 'open'
  && name === 'head') {
    // Ignore the token.
  }
  else if (token[0] === 'close'
  && ['html', 'body', 'br'].indexOf(name) === -1) {
    // Ignore the token.
  }
  else {
    this.stack.pop();
    this.push(['close', Buffer('</head>')])
    this.insertion_mode = 'after_head';
    return true; // reprocess the token
  }
  
}

// https://html.spec.whatwg.org/multipage/syntax.html#the-after-head-insertion-mode
Nest.prototype.process_after_head = function(name, token) {
  if (token[0] === 'open'
  && name === '!doctype') {
    // Ignore token
  }
  else if (token[0] === 'open'
  && name === 'html') {
    return this.process_in_body(name, token);
  }
  else if (token[0] === 'open'
  && name === 'body') {
    this.stack.push(name);
    this.push(token);
    this.insertion_mode = 'in_body';
  }
  else if (token[0] === 'open'
  && name === 'frameset') {
    this.stack.push(name);
    this.push(token);
    this.insertion_mode = 'in_frameset';
  }
  else if (['base', 'basefont', 'bgsound', 'link', 'meta',
            'noframes', 'script', 'style', 'template',
            'title'].indexOf(name) !== -1) {
    return this.process_in_head(name, token);
  }
  else if (token[0] === 'close'
  && name === 'template') {
    return this.process_in_head(name, token);
  }
  else if ((token[0] === 'open' && name === 'head')
  || (token[0] === 'close' && ['html', 'body', 'br'].indexOf(name) === -1)) {
    // Ignore the token
  }
  else {
    this.stack.push('body');
    this.push(['open', Buffer('<body>')])
    this.insertion_mode = 'in_body';
    return true;
  } 
}

// https://html.spec.whatwg.org/multipage/syntax.html#parsing-main-inbody
Nest.prototype.process_in_body = function(name, token) {
  var idx, node, current_node, state;
  if (token[0] === 'open'
  && name === '!doctype') {
    // Ignore token
  }
  else if (token[0] === 'open'
  && name === 'html') {
  }
  else if (['base', 'basefont', 'bgsound', 'link', 'meta',
            'noframes', 'script', 'style', 'template',
            'title'].indexOf(name) !== -1) {
    // TODO: the current implementation catches both start tag
    // and end tag here
    return this.process_in_head(name, token);
  }
  else if (token[0] === 'close'
  && name === 'template') {
    // note: the current implementation never reaches here since
    // 'template' is catched just before
    return this.process_in_head(name, token);
  }
  else if (token[0] === 'open'
  && name === 'body') {
  }
  else if (token[0] === 'open'
  && name === 'frameset') {
  }
  // An end tag whose tag name is "body"
  else if (token[0] === 'close'
  && name === 'body') {
    if (this.has_in_scope('body')) {
    }
    this.insertion_mode = 'after_body';
  }
  // An end tag whose tag name is "html"
  else if (token[0] === 'close'
  && name === 'html') {
    if (this.has_in_scope('body')) {
    }
    this.insertion_mode = 'after_body';
    return true;
  }
  // A start tag whose tag name is "li"
  else if (token[0] === 'open'
  && name === 'li') {
    idx = this.stack.length - 1;
    state = 'loop';
    while (state !== 'done') {
      node = this.stack[idx];
      if (node === 'li') {
        // generate implied end tags
        while ((current_node = this.stack.pop()) !== 'li') {
          this.push(['close', Buffer('</' + current_node + '>')])
        }
        this.push(['close', '</li>']);
        state = 'done';
      }
      else if (tags['special'].indexOf(node) !== -1
      && ['address', 'div', 'p'].indexOf(node) === -1) {
        state = 'done';
      } else {
        idx--;
      }
    }
    this.stack.push(name);
    this.push(token)
  }
  else if (token[0] === 'close'
  && tags['in_body_end_tags'].indexOf(name) !== -1) {
    if (this.has_in_scope(name)) {
      while ((current_node = this.stack.pop()) !== name) {
        this.push(['close', Buffer('</' + current_node + '>')])
      }
      this.push(token);
    } else {
      // Ignore the token.
    }
  }
  // A start tag whose tag name is one of: "caption", "col", "colgroup", "frame", "head", "tbody", "td", "tfoot", "th", "thead", "tr"
  else if (token[0] === 'open'
  && ['caption', 'col', 'colgroup', 'frame', 'head', 'tbody', 'td',
      'tfoot', 'th', 'thead', 'tr'].indexOf(name) !== -1) {
    // Ignore the token
  }
  // Any other start tag
  else if (token[0] === 'open') {
    this.stack.push(name);
    this.push(token);
  }
  
}

// https://html.spec.whatwg.org/multipage/syntax.html#parsing-main-afterbody
Nest.prototype.process_after_body = function(name, token) {
  if (token[0] === 'open'
  && name === '!doctype') {
    // Ignore token
  }
  else if (token[0] === 'open'
  && name === 'html') {
    return this.process_in_body(name, token);
  }
  else if (token[0] === 'close'
  && name === 'html') {
    this.insertion_mode = 'after_after_body';
  }
  else {
    this.insertion_mode = 'in_body';
    return true;
  }
}

// https://html.spec.whatwg.org/multipage/syntax.html#the-after-after-body-insertion-mode
Nest.prototype.process_after_after_body = function(name, token) {
  if (token[0] === 'open'
  && name === '!doctype') {
    // Ignore token
  }
  else if (token[0] === 'open'
  && name === 'html') {
    return this.process_in_body(name, token);
  }
  else {
    this.insertion_mode = 'in_body';
    return true;
  }
}



Nest.prototype.process = function(token) {

  var name, current_node;

  // get the name of the tag (open or close)
  name = getName(token[1]);

  if (remove.indexOf(name) !== -1) {
    return false;
  }

  // early exit for comments and self-closing elements
  if (tags['comment'].indexOf(name) !== -1
  || tags['void-elements'].indexOf(name) !== -1 ) {
    this.push(token);
    return false;
  }

  switch(this.insertion_mode) {
    case 'initial':
      reprocess = this.process_initial(name, token);
      break;
    case 'before_html':
      reprocess = this.process_before_html(name, token);
      break;
    case 'before_head':
      reprocess = this.process_before_head(name, token);
      break;
    case 'in_head':
      reprocess = this.process_in_head(name, token);
      break;
    case 'after_head':
      reprocess = this.process_after_head(name, token);
      break;
    case 'in_body':
      reprocess = this.process_in_body(name, token);
      break;
    case 'after_body':
      reprocess = this.process_after_body(name, token);
      break;
    case 'after_after_body':
      reprocess = this.process_after_after_body(name, token);
      break;
  }

  return reprocess;
}

Nest.prototype._flush = function (next) {

    var reprocess, token;

    // send a virtual EOF token
    token = ['eof', Buffer('<eof/>')];
    while (reprocess = this.process(token)) {}


    // 12.2.6 The end
    // Pop all the nodes off the stack of open elements.
    var current_node;
    while (current_node = this.stack.pop()) {
      this.push(['close', Buffer('</' + current_node + '>')])
    }
    this.push(null);
    next();
};
Nest.prototype.has_in_scope = function(name) {
  return this.stack.indexOf(name) !== -1
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
