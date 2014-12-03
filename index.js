var Transform = require('readable-stream').Transform;
var inherits = require('inherits');

inherits(Nest, Transform);
module.exports = Nest;

var remove = [
  '?xml:namespace' // found in docs where microsoft word fragments were copy/pasted
]

var  OPEN_COMMENT = '!--';
var CLOSE_COMMENT = '-';

var tags = {
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

  'in_body_end_tags_bundle_2':
    [ 'a', 'b', 'big', 'code', 'em', 'font', 'i', 'nobr', 's', 'small', 'strike',
    'strong', 'tt', 'u']
}


function Nest () {
    if (!(this instanceof Nest)) return new Nest;
    Transform.call(this);
    this._writableState.objectMode = true;
    this._readableState.objectMode = true;
    this.insertion_mode = 'initial';
    this.insertion_mode_saved = null;
    this.tokenizer_state = null;
    this.stack = [];
    this.format = [];
    this.head_element_pointer = false;
    this.form_element_pointer = false;

    // an internal buffer is used to buffer tokens
    // when the list of active formatting elements
    // is not empty
    this.buffer = [];
}

/**
 * The insertion mode is a state modeled after 
 * https://html.spec.whatwg.org/multipage/syntax.html#insertion-mode
 *
 * initial: doctype definition
 */

Nest.prototype._transform = function (token, enc, next) {
  var reprocess;
  while (reprocess = this.process(token)) {}
  next();
}

// https://html.spec.whatwg.org/multipage/syntax.html#the-initial-insertion-mode
Nest.prototype.process_initial = function(name, token) {
  if (token[0] === 'open'
  && name === OPEN_COMMENT) {
    this.insertion_mode_saved = this.insertion_mode;
    this.insertion_mode = 'xx_comment';
    return true;
  }
  else if (token[0] === 'open'
  && name === '!doctype') {
    this.insertion_mode = 'before_html';
    this.enqueue(token);
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
  && name === OPEN_COMMENT) {
    this.insertion_mode_saved = this.insertion_mode;
    this.insertion_mode = 'xx_comment';
    return true;
  }
  else if (token[0] === 'open'
  && name === 'html') {
    this.stack.push(name);
    this.enqueue(token);
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
    this.enqueue(['open', Buffer('<html>')]);
    this.insertion_mode = 'before_head';
    return true; // reprocess the token
  }
}

// https://html.spec.whatwg.org/multipage/syntax.html#the-before-head-insertion-mode
Nest.prototype.process_before_head = function(name, token) {
  if (token[0] === 'open'
  && name === OPEN_COMMENT) {
    this.insertion_mode_saved = this.insertion_mode;
    this.insertion_mode = 'xx_comment';
    return true;
  }
  else if (token[0] === 'open'
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
    this.enqueue(token);
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
    this.enqueue(['open', Buffer('<head>')]);
    this.insertion_mode = 'in_head';
    return true; // reprocess the token
  }
}

// https://html.spec.whatwg.org/multipage/syntax.html#parsing-main-inhead
Nest.prototype.process_in_head = function(name, token) {
  if (token[0] === 'open'
  && name === OPEN_COMMENT) {
    this.insertion_mode_saved = this.insertion_mode;
    this.insertion_mode = 'xx_comment';
    return true;
  }
  else if (token[0] === 'open'
  && name === '!doctype') {
    // Ignore token
  }
  else if (token[0] === 'open'
  && name === 'html') {
    return this.process_in_body(name, token);
  }
  else if (token[0] === 'open'
  && ['base', 'basefont', 'bgsound', 'link', 'meta'].indexOf(name) !== -1) {
    this.enqueue(token);
  }
  else if (name === 'title') {
    this.enqueue(token);
    this.insertion_mode_saved = this.insertion_mode;
    this.insertion_mode = 'text';
    this.tokenizer_state = 'RCDATA';
  }
  else if (['noscript'].indexOf(name) !== -1) {
    // TODO: The current implementation expects balanced tags
    this.enqueue(token);
  }
  else if (token[0] === 'open'
  && ['noframes', 'style'].indexOf(name) !== -1) {
    this.enqueue(token);
    this.insertion_mode_saved = this.insertion_mode;
    this.insertion_mode = 'text';
    this.tokenizer_state = 'RAWTEXT';
  }
  else if (token[0] === 'open'
  && name === 'script') {
    this.enqueue(token);
    this.insertion_mode_saved = this.insertion_mode;
    this.insertion_mode = 'text';
    this.tokenizer_state = 'script_data';
  }
  else if (token[0] === 'close'
  && name === 'head') {
    this.stack.pop();
    this.enqueue(token);
    this.insertion_mode = 'after_head';
  }
  else if (name === 'template') {
    // TODO: implement html5 template handling
    this.enqueue(token);
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
    this.enqueue(['close', Buffer('</head>')])
    this.insertion_mode = 'after_head';
    return true; // reprocess the token
  }
  
}

// https://html.spec.whatwg.org/multipage/syntax.html#the-after-head-insertion-mode
Nest.prototype.process_after_head = function(name, token) {
  if (token[0] === 'open'
  && name === OPEN_COMMENT) {
    this.insertion_mode_saved = this.insertion_mode;
    this.insertion_mode = 'xx_comment';
    return true;
  }
  else if (token[0] === 'open'
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
    this.enqueue(token);
    this.insertion_mode = 'in_body';
  }
  else if (token[0] === 'open'
  && name === 'frameset') {
    this.stack.push(name);
    this.enqueue(token);
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
    this.enqueue(['open', Buffer('<body>')])
    this.insertion_mode = 'in_body';
    return true;
  } 
}

// https://html.spec.whatwg.org/multipage/syntax.html#parsing-main-inbody
Nest.prototype.process_in_body = function(name, token) {
  var idx, node, current_node, state;
  // Any other character token
  if (token[0] === 'text') {
    // Reconstruct the active formatting elements, if any.
    this.reconstruct_formatting();
    // Insert the token's character.
    this.enqueue(token);
  }
  else if (token[0] === 'open'
  && name === OPEN_COMMENT) {
    this.insertion_mode_saved = this.insertion_mode;
    this.insertion_mode = 'xx_comment';
    return true;
  }
  else if (token[0] === 'open'
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
          this.enqueue(['close', Buffer('</' + current_node + '>')])
        }
        this.enqueue(['close', '</li>']);
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
    this.enqueue(token)
  }
  else if (token[0] === 'close'
  && tags['in_body_end_tags'].indexOf(name) !== -1) {
    if (this.has_in_scope(name)) {
      while ((current_node = this.stack.pop()) !== name) {
        this.enqueue(['close', Buffer('</' + current_node + '>')])
      }
      this.enqueue(token);
    } else {
      // Ignore the token.
    }
  }
  // An end tag whose tag name is one of: "a", "b", "big", "code", "em",
  // "font", "i", "nobr", "s", "small", "strike", "strong", "tt", "u"
  else if (token[0] === 'close'
  && tags['in_body_end_tags_bundle_2'].indexOf(name) !== -1) {
    this.adoption_agency_algorithm(name);
  }
  // A start tag whose tag name is one of: "caption", "col", "colgroup",
  // "frame", "head", "tbody", "td", "tfoot", "th", "thead", "tr"
  else if (token[0] === 'open'
  && ['caption', 'col', 'colgroup', 'frame', 'head', 'tbody', 'td',
      'tfoot', 'th', 'thead', 'tr'].indexOf(name) !== -1) {
    // Ignore the token
  }
  // Any other start tag
  else if (token[0] === 'open') {
    this.stack.push(name);
    if (tags['formatting'].indexOf(name) !== -1) {
      this.format.push(name);
    }
    this.enqueue(token);
  }
  
}

// https://html.spec.whatwg.org/multipage/syntax.html#parsing-main-afterbody
Nest.prototype.process_after_body = function(name, token) {
  if (token[0] === 'open'
  && name === OPEN_COMMENT) {
    this.insertion_mode_saved = this.insertion_mode;
    this.insertion_mode = 'xx_comment';
    return true;
  }
  else if (token[0] === 'open'
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
  && name === OPEN_COMMENT) {
    this.insertion_mode_saved = this.insertion_mode;
    this.insertion_mode = 'xx_comment';
    return true;
  }
  else if (token[0] === 'open'
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

// https://html.spec.whatwg.org/multipage/syntax.html#parsing-main-incdata
Nest.prototype.process_text = function(name, token) {
  
  // forward all tokens
  this.enqueue(token);
  
  // intercept the end of the text mode
  if (this.tokenizer_state === 'script_data') {
    if (token[0] === 'close'
    && name === 'script') {
      this.insertion_mode = this.insertion_mode_saved;
      this.insertion_mode_saved = null;
      this.tokenizer_state = null;
    }
  }
  else if (this.tokenizer_state === 'RCDATA') {
    if (token[0] === 'close'
    && name === 'title') {
      this.insertion_mode = this.insertion_mode_saved;
      this.insertion_mode_saved = null;
      this.tokenizer_state = null;
    }
  }
  else if (this.tokenizer_state === 'RAWTEXT') {
    if (token[0] === 'close'
    && ['noframes', 'style'].indexOf(name) !== -1) {
      this.insertion_mode = this.insertion_mode_saved;
      this.insertion_mode_saved = null;
      this.tokenizer_state = null;
    }
  }
}

Nest.prototype.process_xx_comment = function(name, token) {
  
  // while in comment mode, accept all tokens
  this.enqueue(token);

  // try to see if we can exit comment mode
  if (token[0] === 'close'
  && name === CLOSE_COMMENT) {
    this.insertion_mode = this.insertion_mode_saved;
    this.insertion_mode_saved = null;
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
  if (tags['void-elements'].indexOf(name) !== -1 ) {
    this.enqueue(token);
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
    case 'text':
      reprocess = this.process_text(name, token);
      break;
    case 'xx_comment':
      reprocess = this.process_xx_comment(name, token);
      break;
  }

  return reprocess;
}

Nest.prototype._flush = function (next) {

    var reprocess, token;

    // send a virtual EOF token
    token = ['eof', Buffer('<eof/>')];
    while (reprocess = this.process(token)) {}

    // flush formatting buffer
    while (token = this.buffer.shift()) {
      this.push(token);
    }

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

Nest.prototype.reconstruct_formatting = function() {
 
  // 1. If there are no entries in the list of active formatting elements,
  // then there is nothing to reconstruct; stop this algorithm.
  if (this.format.length === 0) {
    return;
  }
  
  // 2. If the last (most recently added) entry in the list of active formatting elements is a marker,
  // or if it is an element that is in the stack of open elements, then there is nothing to reconstruct;
  // stop this algorithm.
  // TODO: implement marker
  var entry_idx = this.format.length - 1;
  var entry = this.format[entry_idx];
  if (this.stack.indexOf(entry) !== -1) {
    return;
  }

  // 3. Let entry be the last (most recently added) element in the list of active formatting elements.
  // ..already done
  
  var step = 'rewind';
  while (step !== 'done') {

    // 4. Rewind: If there are no entries before entry in the list of active formatting elements,
    // then jump to the step labeled create.
    if (step === 'rewind') {
      if (entry_idx === 0) {
        step = 'create';
        continue;
      }

      // 5. Let entry be the entry one earlier than entry in the list of active formatting elements.
      entry_idx--;
      entry = this.format[entry_idx];

      // 6. If entry is neither a marker nor an element that is also in the stack of open elements,
      // go to the step labeled rewind.
      // TODO: implement marker
      if (this.stack.indexOf(entry) === -1) {
        step = 'rewind';
        continue;
      }

      step = 'advance';
      continue;
    }
    else if (step === 'advance') {
      // 7. Advance: Let entry be the element one later than entry in the list of active formatting
      // elements.
      entry_idx++;
      entry = this.format[entry_idx];
      step = 'create';
      continue;
    }
    else if (step === 'create') {

      // 8. Create: Insert an HTML element for the token for which the element entry was created,
      // to obtain new element.
      this.enqueue(['open', Buffer('<' + entry + '>')]);
      this.stack.push(entry);

      // 9. Replace the entry for entry in the list with an entry for new element.
      // TODO: try to confirm that there is nothing to do here in html-nest's context

      // 10. If the entry for new element in the list of active formatting elements is not the
      // last entry in the list, return to the step labeled advance.
      if (entry_idx !== this.format.length - 1) {
        step = 'advance';
        continue;
      }

      step = 'done';
      continue;

    }

  }
}

Nest.prototype.adoption_agency_algorithm = function(name) {
  var current_node = this.stack[this.stack.length-1];

  // 1.
  if (current_node === name
  && this.format.indexOf(current_node) === -1) {
    this.stack.pop();
    this.enqueue(['close', Buffer('</' + current_node + '>')])
    return;
  }

  // 2.
  var outer_loop_counter = 0;

  // 3.
  while (outer_loop_counter < 8) {
    // 4.
    outer_loop_counter++;

    // 5.
    var last_marker_idx = -1; // TODO: implement markers
    var formatting_element_idx = this.format.lastIndexOf(name)
    if (formatting_element_idx <= last_marker_idx) {
      // abort these steps and instead act as described in the "any other end tag" entry above.
      // TODO: goto "any other end tag"
      return
    }

    // 6. If formatting element is not in the stack of open elements, then this is a parse error;
    // remove the element from the list, and abort these steps.
    var formatting_element = this.format[formatting_element_idx];
    if (this.stack.indexOf(formatting_element) === -1) {
      this.format.splice(formatting_element_idx, 1);
      return;
    }

    // 7. If formatting element is in the stack of open elements, but the element is not in scope,
    // then this is a parse error; abort these steps.
    // TODO: clarify the "scope" evaluation

    // 8. If formatting element is not the current node, this is a parse error.
    // (But do not abort these steps.)    

    // 9. Let furthest block be the topmost node in the stack of open elements that is lower in the stack
    // than formatting element, and is an element in the special category. There might not be one.
    var fe_stack_idx = this.stack.lastIndexOf(formatting_element);
    var furthest_block = null;
    var furthest_block_idx = -1;
    for (var i = fe_stack_idx + 1; i < this.stack.length; i++) {
      if (tags['special'].indexOf(this.stack[i]) !== -1) {
        furthest_block_idx = i;
        furthest_block = this.stack[i];
        break;
      }
    }
    
    // 10. If there is no furthest block, then the UA must first pop all the nodes from the bottom of the
    // stack of open elements, from the current node up to and including formatting element, then remove
    // formatting element from the list of active formatting elements, and finally abort these steps.
    if (!furthest_block) {
      do {
        var current_node = this.stack.pop();
        this.enqueue(['close', Buffer('</' + current_node + '>')])
      } while (current_node !== formatting_element)

      this.format.splice(formatting_element_idx, 1);
      return;
    }

    // 11. Let common ancestor be the element immediately above formatting element
    // in the stack of open elements.
    var common_ancestor_idx = fe_stack_idx - 1;
    var common_ancestor = this.stack[common_ancestor_idx];

    // 12. Let a bookmark note the position of formatting element in the list of
    // active formatting elements relative to the elements on either side of it
    // in the list.
    
    // 13. Let node and last node be furthest block. Follow these steps:
    var node = last_node = furthest_block;
    var node_sidx = last_node_sidx = furthest_block_idx;

    // 13.1. Let inner loop counter be zero.
    var inner_loop_counter = 0;

    while(true) {
      // 13.2. Inner loop: Increment inner loop counter by one.
      inner_loop_counter++;

      // 13.3. Let node be the element immediately above node in the stack of open elements,
      // or if node is no longer in the stack of open elements
      // (e.g. because it got removed by this algorithm), the element that was immediately
      // above node in the stack of open elements before node was removed.
      node_sidx--;
      node = this.stack[node_sidx];

      // 13.4. If node is formatting element, then go to the next step in the overall algorithm.
      if (tags['formatting'].indexOf(node) !== -1) {
        break;
      }

      // 13.5. If inner loop counter is greater than three and node is in the list of
      // active formatting elements, then remove node from the list of active formatting elements.
      if (inner_loop_counter > 3
      && this.format.indexOf(node) !== -1) {
        var tmp_fidx = this.format.indexOf(node);
        this.format.splice(tmp_fidx, 1);
      }

      // 13.6. If node is not in the list of active formatting elements, then remove node from
      // the stack of open elements and then go back to the step labeled inner loop.
      if (this.format.indexOf(node) === -1) {
        this.stack.splice(node_sidx, 1);
        continue;
      }

      // 13.7. Create an element for the token for which the element node was created,
      // in the HTML namespace, with common ancestor as the intended parent;
      // replace the entry for node in the list of active formatting elements with an entry
      // for the new element, replace the entry for node in the stack of open elements
      // with an entry for the new element, and let node be the new element.

      // TO BE CONTINUED WITH AN EXAMPLE...
    }

    // 14. Insert whatever last node ended up being in the previous step
    // at the appropriate place for inserting a node, but using common ancestor as the override target.

    // TODO: remove 'no comment' simplification (open tag problem)
    // body > b > p
    // maybe remember / associate buffer freeze with stack position
    var node_bidx=0;
    var open_target = last_node_sidx - node_sidx + 1;
    var open_cur = 0;
    while(true) {
      if (this.buffer[node_bidx][0] === 'open') {
        open_cur++;
      }
      if (open_cur === open_target) {
        break;
      } else {
        node_bidx++
      }
    }
    this.buffer.splice(node_bidx, 0, ['close', Buffer('</' + node + '>')]);

    // 15. Create an element for the token for which formatting element was created,
    // in the HTML namespace, with furthest block as the intended parent.

    // 16. Take all of the child nodes of furthest block and append them to the element
    // created in the last step.
    
    // 17. Append that new element to furthest block.
    this.buffer.splice(node_bidx+2, 0, ['open', Buffer('<' + formatting_element + '>')]);

    // 18. Remove formatting element from the list of active formatting elements,
    // and insert the new element into the list of active formatting elements
    // at the position of the aforementioned bookmark.
    
    // same position for the example
    //this.format.splice(formatting_element_idx, 0);

    // 19. Remove formatting element from the stack of open elements, and insert the new
    // element into the stack of open elements immediately below the position of
    // furthest block in that stack.
    this.stack.splice(node_sidx, 1);
    // open & close
    this.buffer.push(['close', Buffer('</' + formatting_element + '>')]);

/*
    for (var k=0; k<this.buffer.length; k++) {
      console.log(this.buffer[k][0], this.buffer[k][1].toString())
    }
*/

    // 20. Jump back to the step labeled outer loop.
  }

}

Nest.prototype.enqueue = function(token) {

  var tok;
  if (this.format.length === 0) {
    while (tok = this.buffer.shift()) {
      this.push(tok);
    }
    this.push(token);
  }
  else {
    this.buffer.push(token);
    //console.log(this.buffer.length);
  }
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
