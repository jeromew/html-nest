var Transform = require('readable-stream').Transform;
var inherits = require('inherits');

inherits(Nest, Transform);
module.exports = Nest;

var remove = [
  '?xml:namespace' // found in docs where microsoft word fragments were copy/pasted
]

var  OPEN_COMMENT = '!--';
var CLOSE_COMMENT = '-';

var FMT_MARKER = '_';

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
    this.frameset_ok;
    this.pending_table_character_tokens;
    this.foster_parenting = false;

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
  // A start tag whose tag name is "table"
  else if (token[0] === 'open'
  && name === 'table') {
    // If the Document is not set to quirks mode, and the stack of
    // open elements has a p element in button scope, then close a p element.
    // TODO: p element in button scope

    // Insert an HTML element for the token.
    this.stack.push(name);
    this.enqueue(token);

    // Set the frameset-ok flag to "not ok".
    this.frameset_ok = 'not ok';

    // Switch the insertion mode to "in table".
    this.insertion_mode = 'in_table';
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

// https://html.spec.whatwg.org/multipage/syntax.html#parsing-main-intable
Nest.prototype.process_in_table = function(name, token) {
  var current_node;
  current_node = this.stack[this.stack.length - 1];
  // A character token, if the current node is table, tbody, tfoot, thead, or tr element
  if (token[0] === 'text'
  && ['table', 'tbody', 'tfoot', 'thead', 'tr'].indexOf(current_node) !== -1) {
    // Let the pending table character tokens be an empty list of tokens.
    this.pending_table_character_tokens = [];
    // Let the original insertion mode be the current insertion mode.
    this.insertion_mode_saved = this.insertion_mode;
    // Switch the insertion mode to "in table text" and reprocess the token.
    this.insertion_mode = 'in_table_text';
    return true;
  }
  // A comment token
  else if (token[0] === 'open'
  && name === OPEN_COMMENT) {
    // Insert a comment.
    this.insertion_mode_saved = this.insertion_mode;
    this.insertion_mode = 'xx_comment';
    return true;
  }
  // A DOCTYPE token
  else if (token[0] === 'open'
  && name === '!doctype') {
    // Parse error. Ignore the token.
  }
  // A start tag whose tag name is "caption"
  else if (token[0] === 'open'
  && name === 'caption') {
    // Clear the stack back to a table context. (See below.)
    this.clear_the_stack_back_to_a_table_context();
    // Insert a marker at the end of the list of active formatting elements.
    this.format.push(FMT_MARKER);
    // Insert an HTML element for the token, then switch the insertion mode to "in caption".
    this.stack.push(name);
    this.enqueue(token);
    this.insertion_mode = 'in_caption';
  }
  // A start tag whose tag name is "colgroup"
  else if (token[0] === 'open'
  && name === 'colgroup') {
    // Clear the stack back to a table context. (See below.)
    this.clear_the_stack_back_to_a_table_context();
    // Insert an HTML element for the token, then switch the insertion mode to "in column group".
    this.stack.push(name);
    this.enqueue(token);
    this.insertion_mode = 'in_column_group';
  }
  // A start tag whose tag name is "col"
  else if (token[0] === 'open'
  && name === 'col') {
    // Clear the stack back to a table context. (See below.)
    this.clear_the_stack_back_to_a_table_context();
    // Insert an HTML element for a "colgroup" start tag token with no attributes,
    // then switch the insertion mode to "in column group". 
    this.stack.push('colgroup');
    this.enqueue(['open', Buffer('<colgroup>')]);
    this.insertion_mode = 'in_column_group';
    // Reprocess the current token.
    return true;
  }
  // A start tag whose tag name is one of: "tbody", "tfoot", "thead"
  else if (token[0] === 'open'
  && ['tbody', 'tfoot', 'thead'].indexOf(name) !== -1) {
    // Clear the stack back to a table context. (See below.)
    this.clear_the_stack_back_to_a_table_context();
    // Insert an HTML element for the token, then switch the insertion mode to "in table body".
    this.stack.push(name);
    this.enqueue(token);
    this.insertion_mode = 'in_table_body';
  }
  // A start tag whose tag name is one of: "td", "th", "tr"
  else if (token[0] === 'open'
  && ['td', 'th', 'tr'].indexOf(name) !== -1) {
    // Clear the stack back to a table context. (See below.)
    this.clear_the_stack_back_to_a_table_context();
    // Insert an HTML element for a "tbody" start tag token with no attributes,
    // then switch the insertion mode to "in table body".
    this.stack.push('tbody');
    this.enqueue(['open', Buffer('<tbody>')]);
    this.insertion_mode = 'in_table_body';
    // Reprocess the current token.
    return true;
  }
  // A start tag whose tag name is "table"
  else if (token[0] === 'open'
  && name === 'table') {
    // Parse error.
    // If the stack of open elements does not have a table element in table scope,
    // ignore the token.
    if (!this.has_in_table_scope('table')) {
      return false;
    }
    
    // Pop elements from this stack until a table element has been popped from the stack.
    do {
      current_node = this.stack.pop();
      this.enqueue(['close', Buffer('</' + current_node + '>')])
    } while (current_node !== 'table')

    // Reset the insertion mode appropriately.
    this.reset_the_insertion_mode_appropriately();

    // Reprocess the token.
    return true;
  }
  // An end tag whose tag name is "table"
  else if (token[0] === 'close'
  && name === 'table') {
    // If the stack of open elements does not have a table element in table scope,
    // this is a parse error; ignore the token.
    if (!this.has_in_table_scope('table')) {
      return false;
    }
    // Pop elements from this stack until a table element has been popped from the stack.
    do {
      current_node = this.stack.pop();
      this.enqueue(['close', Buffer('</' + current_node + '>')])
    } while (current_node !== 'table')

    // Reset the insertion mode appropriately.
    this.reset_the_insertion_mode_appropriately();
  }
  // An end tag whose tag name is one of: "body", "caption", "col", "colgroup",
  // "html", "tbody", "td", "tfoot", "th", "thead", "tr"
  else if (token[0] === 'close'
  && ['body', 'caption', 'col', 'colgroup', 'html', 'tbody',
  'td', 'tfoot', 'th', 'thead', 'tr'].indexOf(name) !== -1) {
    // Parse error. Ignore the token.
    return;
  }
  // A start tag whose tag name is one of: "style", "script", "template"
  // An end tag whose tag name is "template"
  else if ((token[0] === 'close' && name === 'template')
  || (token[0] === 'open'
  && ['style', 'script', 'template'].indexOf(name) !== -1)) {
    // Process the token using the rules for the "in head" insertion mode.
    return this.process_in_head(name, token);
  }
  // A start tag whose tag name is "input"
  else if (token[0] === 'open'
  && name === 'input') {
    // If the token does not have an attribute with the name "type", or if it does,
    // but that attribute's value is not an ASCII case-insensitive match
    // for the string "hidden", then: act as described in the "anything else" entry below.

    // TODO: implement get attribute here
    // TODO: implement form handling
    
    // Otherwise:
    // Insert an HTML element for the token, and set the form element pointer to point to the element created.
    // Pop that form element off the stack of open elements.
  }
  // A start tag whose tag name is "form"
  else if (token[0] === 'open'
  && name === 'form') {
    // Parse error.

    // If there is a template element on the stack of open elements,
    // or if the form element pointer is not null, ignore the token.
    if ( (this.stack.indexOf('template') !== -1)
    || this.form_element_pointer) {
      return;
    }

    // Insert an HTML element for the token, and set the form element pointer to point to the element created.
    // Pop that form element off the stack of open elements.
  }
  // An end-of-file token
  else if (false) {
    // Process the token using the rules for the "in body" insertion mode.
    return this.process_in_body(name, token);
  }
  // Anything else
  else {
    // Parse error.
    // Enable foster parenting, process the token using the rules for the "in body"
    // insertion mode, and then disable foster parenting.
    this.foster_parenting = true;
    var re = this.process_in_body(name, token);
    this.foster_parenting = false;
    return re;
  }
  
}

Nest.prototype.clear_the_stack_back_to_a_table_context = function() {
  var current_node;
  while (['table', 'template', 'html'].indexOf(current_node = this.stack.pop()) === -1) {
      this.enqueue(['close', Buffer('</' + current_node + '>')]);
  }
  this.stack.push(current_node);
}
Nest.prototype.clear_the_stack_back_to_a_table_body_context = function() {
  var current_node;
  while (['tbody', 'tfoot', 'thead', 'template', 'html'].indexOf(current_node = this.stack.pop()) === -1) {
      this.enqueue(['close', Buffer('</' + current_node + '>')]);
  }
  this.stack.push(current_node);
}
Nest.prototype.clear_the_stack_back_to_a_table_row_context = function() {
  var current_node;
  while (['tr', 'template', 'html'].indexOf(current_node = this.stack.pop()) === -1) {
      this.enqueue(['close', Buffer('</' + current_node + '>')]);
  }
  this.stack.push(current_node);
}
Nest.prototype.generate_implied_end_tags = function() {
  var current_node;
  var list = ['dd','dt','li','option','optgroup','p','rp','rt'];
  while (list.indexOf(current_node = this.stack.pop()) !== -1) {
    this.enqueue(['close', Buffer('</' + current_node + '>')]);
  }
  this.stack.push(current_node);
  return current_node;
}

Nest.prototype.reset_the_insertion_mode_appropriately = function() {
  var ancestor, ancestor_sidx;
  // 1. Let last be false.
  var last = false;

  // 2. Let node be the last node in the stack of open elements.
  var node_sidx = this.stack.length;
  var node;
  while(true) {
    node_sidx--;
    node = this.stack[node_sidx];

    // 3. Loop: If node is the first node in the stack of open elements,
    // then set last to true, and, if the parser was originally created as part of
    // the HTML fragment parsing algorithm (fragment case), set node to the context
    // element passed to that algorithm.
    if (node_sidx === 0) {
      last = true;
    }

    // 4. If node is a select element, run these substeps:
    if (node === 'select') {
      // 4.1. If last is true, jump to the step below labeled done.
      if (!last) {
        // 4.2. Let ancestor be node.
        ancestor_sidx = node_sidx;
        ancestor = node;
        // 4.3 Loop: If ancestor is the first node in the stack of open elements,
        // jump to the step below labeled done.
        while (ancestor_sidx > 0) {
          // 4.4. Let ancestor be the node before ancestor in the stack
          // of open elements.
          ancestor_sidx--;
          ancestor = this.stack[ancestor_sidx];
          // 4.5 If ancestor is a template node, jump to the step below labeled done.
          if (ancestor === 'template') {
            break;
          }
          // 4.6. If ancestor is a table node, switch the insertion mode to
          // "in select in table" and abort these steps.
          if (ancestor === 'table') {
            this.insertion_mode = 'in_select_in_table';
            return;
          }
          // 4.7. Jump back to the step labeled loop.
        }
      }
      // 4.8. Done: Switch the insertion mode to "in select" and abort these steps.
      this.insertion_mode = 'in_select';
      return;
    }
    // 5. If node is a td or th element and last is false, then switch the insertion mode
    // to "in cell" and abort these steps.
    else if ((node === 'td' || node === 'th') && !last) {
      this.insertion_mode = 'in_cell';
      return;
    }
    // 6. If node is a tr element, then switch the insertion mode to "in row" and abort these steps.
    else if (node === 'tr') {
      this.insertion_mode = 'in_row';
      return;
    }
    // 7. If node is a tbody, thead, or tfoot element, then switch the insertion mode
    // to "in table body" and abort these steps.
    else if (['tbody', 'thead', 'tfoot'].indexOf(node) !== -1) {
      this.insertion_mode = 'in_table_body';
      return;
    }
    // 8. If node is a caption element, then switch the insertion mode to "in caption"
    // and abort these steps.
    else if (node === 'caption') {
      this.insertion_mode = 'in_caption';
      return;
    }
    // 9. If node is a colgroup element, then switch the insertion mode to "in column group"
    // and abort these steps.
    else if (node === 'colgroup') {
      this.insertion_mode = 'in_column_group';
      return;
    }
    // 10. If node is a table element, then switch the insertion mode to "in table"
    // and abort these steps.
    else if (node === 'table') {
      this.insertion_mode = 'in_table';
      return;
    }
    // 11. If node is a template element, then switch the insertion mode to the current template
    // insertion mode and abort these steps.
    else if (node === 'template') {
      this.insertion_mode = this.current_template_insertion_mode();
      return;
    }
    // 12. If node is a head element and last is false, then switch the insertion mode to "in head"
    // and abort these steps.
    else if (node === 'head' && !last) {
      this.insertion_mode = 'in_head';
      return;
    }
    // 13. If node is a body element, then switch the insertion mode to "in body" and abort these steps.
    else if (node === 'body') {
      this.insertion_mode = 'in_body';
      return;
    }
    // 14. If node is a frameset element, then switch the insertion mode to "in frameset"
    // and abort these steps. (fragment case)
    else if (node === 'frameset') {
      this.insertion_mode = 'in_frameset';
      return;
    }
    // 15. If node is an html element, run these substeps:
    else if (node === 'html') {
      // 15.1. If the head element pointer is null, switch the insertion mode
      // to "before head" and abort these steps. (fragment case)
      if (!this.head_element_pointer) {
        this.insertion_mode = 'before_head';
        return
      }
      // 15.2. Otherwise, the head element pointer is not null, switch the insertion mode
      // to "after head" and abort these steps.
      this.insertion_mode = 'after_head';
    }
    else if (last) {
      this.insertion_mode = 'in_body';
      return;
    }

    // 17. Let node now be the node before node in the stack of open elements.
    // 18. Return to the step labeled loop.
  }
}

// https://html.spec.whatwg.org/multipage/syntax.html#parsing-main-intabletext
Nest.prototype.process_in_table_text = function(name, token) {
  var tok;
  // A character token that is U+0000 NULL
  if (false) {
    // TODO: see how html-tokenize could isolate such tokens this
    // Parse error. Ignore the token.
  }
  // Any other character token
  else if (token[0] === 'text') {
    // Append the character token to the pending table character tokens list.
    this.pending_table_character_tokens.push(token);
  }
  // Anything else
  else {
    // If any of the tokens in the pending table character tokens list are
    // character tokens that are not space characters, then this is a parse error:
    // reprocess the character tokens in the pending table character tokens list
    // using the rules given in the "anything else" entry in the "in table"
    // insertion mode.
    //TODO: check for space characters only
    
    // Otherwise, insert the characters given by the pending table character tokens list.
    while (tok = this.pending_table_character_tokens.shift()) {
      this.enqueue(tok);
    }

    // Switch the insertion mode to the original insertion mode and reprocess the token.
    this.insertion_mode = this.insertion_mode_saved;
    this.insertion_mode_saved = null;
    return true;
  }
}

// https://html.spec.whatwg.org/multipage/syntax.html#parsing-main-incaption
Nest.prototype.process_in_caption = function(name, token) {
  console.log('in_caption is NOT IMPLEMENTED');
}

// https://html.spec.whatwg.org/multipage/syntax.html#parsing-main-incolgroup
Nest.prototype.process_in_column_group = function(name, token) {
  console.log('in_column_group is NOT IMPLEMENTED');
}

// https://html.spec.whatwg.org/multipage/syntax.html#parsing-main-intbody
Nest.prototype.process_in_table_body = function(name, token) {
  var current_node;
  // A start tag whose tag name is "tr"
  if (token[0] === 'open'
  && name === 'tr') {
    // Clear the stack back to a table body context. (See below.)
    this.clear_the_stack_back_to_a_table_body_context();
    // Insert an HTML element for the token, then switch the insertion mode to "in row".
    this.stack.push(name);
    this.enqueue(token);
    this.insertion_mode = 'in_row';
  }
  // A start tag whose tag name is one of: "th", "td"
  else if (token[0] === 'open'
  && ['th', 'td'].indexOf(name) !== -1) {
    // Parse error.
    // Clear the stack back to a table body context. (See below.)
    this.clear_the_stack_back_to_a_table_body_context();
    // Insert an HTML element for a "tr" start tag token with no attributes,
    // then switch the insertion mode to "in row".
    this.stack.push('tr');
    this.enqueue(['open', Buffer('<tr>')]);
    this.insertion_mode = 'in_row';
    //Reprocess the current token.
    return true;
  }
  // An end tag whose tag name is one of: "tbody", "tfoot", "thead"
  else if (token[0] === 'close'
  && ['tbody', 'tfoot', 'thead'].indexOf(name) !== -1) {
    // If the stack of open elements does not have an element in table scope
    // that is an HTML element with the same tag name as the token,
    // this is a parse error; ignore the token.
    if (!this.has_in_table_scope(name)) {
      return;
    }
    // Clear the stack back to a table body context. (See below.)
    this.clear_the_stack_back_to_a_table_body_context();
    // Pop the current node from the stack of open elements.
    // Switch the insertion mode to "in table".
    current_node = this.stack.pop();
    this.enqueue(['close', Buffer('</' + current_node + '>')]);
    this.insertion_mode = 'in_table';
  }
  // A start tag whose tag name is one of: "caption", "col", "colgroup",
  // "tbody", "tfoot", "thead"
  // An end tag whose tag name is "table"
  else if ((token[0] === 'close' && name === 'table')
  || (token[0] === 'open'
  && ['caption', 'col', 'colgroup', 'tbody', 'tfoot', 'thead'].indexOf(name) !== -1)) {
    // If the stack of open elements does not have a tbody, thead, or tfoot
    // element in table scope, this is a parse error; ignore the token.
    if (!this.has_in_table_scope('tbody')
    && !this.has_in_table_scope('thead')
    && !this.has_in_table_scope('tfoot')) {
      return;
    }
    // Otherwise:
    // Clear the stack back to a table body context. (See below.)
    this.clear_the_stack_back_to_a_table_body_context();
    // Pop the current node from the stack of open elements.
    // Switch the insertion mode to "in table".
    current_node = this.stack.pop();
    this.enqueue(['close', Buffer('</' + current_node + '>')]);
    this.insertion_mode = 'in_table';
    // Reprocess the token.
    return true;
  }
  // An end tag whose tag name is one of: "body", "caption", "col", "colgroup",
  // "html", "td", "th", "tr"
  else if (token[0] === 'close'
  && ['body', 'caption', 'col', 'colgroup',
  'html', 'td', 'th', 'tr'].indexOf(name) !== -1) {
    // Parse error. Ignore the token.
  }
  // Anything else
  else {
    return this.process_in_table(name, token);
  }
}

Nest.prototype.process_in_select = function(name, token) {
  console.log('in_select is NOT IMPLEMENTED');
}
Nest.prototype.process_in_select_in_table = function(name, token) {
  console.log('in_select_in_table is NOT IMPLEMENTED');
}
Nest.prototype.process_in_cell = function(name, token) {
  var current_node;
  var marker;
  // An end tag whose tag name is one of: "td", "th"
  if (token[0] === 'close'
  && ['td', 'th'].indexOf(name) !== -1) {
    // If the stack of open elements does not have an element
    // in table scope that is an HTML element with the same tag
    // name as that of the token, then this is a parse error;
    // ignore the token.
    if (!this.has_in_table_scope(name)) {
      return;
    }
    // Otherwise:
    // Generate implied end tags.
    current_node = this.generate_implied_end_tags();
    // Now, if the current node is not an HTML element with the same
    // tag name as the token, then this is a parse error.
    if (current_node !== name) {
    }
    // Pop elements from the stack of open elements stack until
    // an HTML element with the same tag name as the token has
    // been popped from the stack.
    do {
      current_node = this.stack.pop();
      this.enqueue(['close', Buffer('</'+current_node+'>')])
    } while (current_node !== name)
    // Clear the list of active formatting elements up to the last marker.
    marker = this.format.lastIndexOf(FMT_MARKER);
    if (marker !== -1) {
      this.format = this.format.slice(0, marker);
    }
    // Switch the insertion mode to "in row".
    this.insertion_mode = 'in_row';
  }
  // A start tag whose tag name is one of: "caption", "col", "colgroup",
  // "tbody", "td", "tfoot", "th", "thead", "tr"
  else if (token[0] === 'open'
  && ['caption', 'col', 'colgroup', 'tbody', 'td', 'tfoot',
  'th', 'thead', 'tr'].indexOf(name) !== -1) {
    // If the stack of open elements does not have a td or th
    // element in table scope, then this is a parse error;
    // ignore the token. (fragment case)
    if (!this.has_in_table_scope('td')
    && !this.has_in_table_scope('tr')) {
      return;
    }
    // Otherwise, close the cell (see below) and reprocess the token.
    this.close_the_cell();
    return true;
  }
  // An end tag whose tag name is one of: "body", "caption",
  // "col", "colgroup", "html"
  else if (token[0] === 'close'
  && ['body','caption','col','colgroup','html'].indexOf(name) !== -1) {
    // Parse error. Ignore the token.
  }
  // An end tag whose tag name is one of: "table", "tbody",
  // "tfoot", "thead", "tr"
  else if (token[0] === 'close'
  && ['table','tbody','tfoot','thead','tr'].indexOf(name) !== 1) {
    // If the stack of open elements does not have an element
    // in table scope that is an HTML element with the same tag
    // name as that of the token, then this is a parse error;
    // ignore the token.
    if (!this.has_in_table_scope(name)) {
      return;
    }
    // Otherwise, close the cell (see below) and reprocess the token.
    this.close_the_cell();
    return true;
  }
  // Anything else
  else {
    // Process the token using the rules for the "in body" insertion mode.
    return this.process_in_body(name, token);
  }
}

Nest.prototype.close_the_cell = function() {
  var node, marker;
  // 1.Generate implied end tags.
  this.generate_implied_end_tags();
  // 2. If the current node is not now a td element or a th element,
  // then this is a parse error.
  // 3. Pop elements from the stack of open elements stack until
  // a td element or a th element has been popped from the stack.
  do {
    node = this.stack.pop();
    this.enqueue(['close', Buffer('</'+node+'>')])
  } while (['td', 'th'].indexOf(node) === -1)

  // 4. Clear the list of active formatting elements up to the last marker.
  marker = this.format.lastIndexOf(FMT_MARKER);
  if (marker !== -1) {
    this.format = this.format.slice(0, marker);
  }
  // 5. Switch the insertion mode to "in row".
  this.insertion_mode = 'in_row';
}

// https://html.spec.whatwg.org/multipage/syntax.html#parsing-main-intr
Nest.prototype.process_in_row = function(name, token) {
  var current_node;
  // A start tag whose tag name is one of: "th", "td"
  if (token[0] === 'open'
  && ['td', 'th'].indexOf(name) !== -1) {
    // Clear the stack back to a table row context. (See below.)
    this.clear_the_stack_back_to_a_table_row_context();
    // Insert an HTML element for the token, then switch
    // the insertion mode to "in cell".
    this.stack.push(name);
    this.enqueue(token);
    this.insertion_mode = 'in_cell';
    // Insert a marker at the end of the list of active formatting elements.
    this.format.push(FMT_MARKER);
  }
  // An end tag whose tag name is "tr"
  else if (token[0] === 'close'
  && name === 'tr') {
    // If the stack of open elements does not have a tr element
    // in table scope, this is a parse error; ignore the token.
    if (!this.has_in_table_scope('tr')) {
      return;
    }
    // Otherwise:
    // Clear the stack back to a table row context. (See below.)
    this.clear_the_stack_back_to_a_table_row_context();
    // Pop the current node (which will be a tr element) from the
    // stack of open elements. Switch the insertion mode
    // to "in table body".
    current_node = this.stack.pop();
    this.enqueue(token);
    this.insertion_mode = 'in_table_body';
  }
  // A start tag whose tag name is one of: "caption", "col", "colgroup",
  // "tbody", "tfoot", "thead", "tr"
  // An end tag whose tag name is "table"
  else if ((token[0] === 'close' && name === 'table')
  || (token[0] === 'open'
  && ['caption', 'col', 'colgroup', 'tbody',
  'tfoot', 'thead', 'tr'].indexOf(name) !== -1)) {
    // If the stack of open elements does not have a tr element
    // in table scope, this is a parse error; ignore the token.
    if (!this.has_in_table_scope('tr')) {
      return;
    }
    // Otherwise:
    // Clear the stack back to a table row context. (See below.)
    this.clear_the_stack_back_to_a_table_row_context();
    // Pop the current node (which will be a tr element) from the
    // stack of open elements. Switch the insertion mode to "in table body".
    current_node = this.stack.pop();
    this.enqueue(['close', Buffer('</'+current_node+'>')])
    this.insertion_mode = 'in_table_body';
    // Reprocess the token.
    return true;
  }
  // An end tag whose tag name is one of: "tbody", "tfoot", "thead"
  else if (token[0] === 'close'
  && ['tbody', 'tfoot', 'thead'].indexOf(name) !== -1) {
    // If the stack of open elements does not have an element
    // in table scope that is an HTML element with the same tag name
    // as the token, this is a parse error; ignore the token.
    if (!this.has_in_table_scope(name)) {
      return;
    }
    // If the stack of open elements does not have a tr element
    // in table scope, ignore the token.
    if (!this.has_in_table_scope('tr')) {
      return;
    }
    // Otherwise:
    // Clear the stack back to a table row context. (See below.)
    this.clear_the_stack_back_to_a_table_row_context();
    // Pop the current node (which will be a tr element) from the
    // stack of open elements. Switch the insertion mode to "in table body".
    current_node = this.stack.pop();
    this.enqueue(['close', Buffer('</'+current_node+'>')])
    this.insertion_mode = 'in_table_body';
    // Reprocess the token.
    return true;
  }
  // An end tag whose tag name is one of: "body", "caption", "col",
  // "colgroup", "html", "td", "th"
  else if (token[0] === 'close'
  && ['body', 'caption', 'col', 'colgroup',
  'html', 'td', 'th'].indexOf(name) !== -1) {
    // Parse error. Ignore the token.
  }
  // Anything else
  else {
    // Process the token using the rules for the "in table" insertion mode.
    return this.process_in_table(name, token);
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

  //console.log(this.insertion_mode, token[0], token[1].toString());
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
    case 'in_table':
      reprocess = this.process_in_table(name, token);
      break;
    case 'in_table_text':
      reprocess = this.process_in_table_text(name, token);
      break;
    case 'in_caption':
      reprocess = this.process_in_caption(name, token);
      break;
    case 'in_column_group':
      reprocess = this.process_in_column_group(name, token);
      break;
    case 'in_table_body':
      reprocess = this.process_in_table_body(name, token);
      break;
    case 'in_select':
      reprocess = this.process_in_select(name, token);
      break;
    case 'in_select_in_table':
      reprocess = this.process_in_select_in_table(name, token);
      break;
    case 'in_cell':
      reprocess = this.process_in_cell(name, token);
      break;
    case 'in_row':
      reprocess = this.process_in_row(name, token);
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
Nest.prototype.has_in_table_scope = function(target) {
  return this.has_in_specific_scope(target, ['html', 'table', 'template']);
}
Nest.prototype.has_in_specific_scope = function(target, scope) {
  // 1. Initialise node to be the current node (the bottommost node of the stack).
  var node_sidx = this.stack.length;
  var node;

  while (true) {
    node_sidx--;
    node = this.stack[node_sidx];
  
    // 2. If node is the target node, terminate in a match state.
    if (node === target) return true;

    // 3. Otherwise, if node is one of the element types in list, terminate in a failure state.
    if (scope.indexOf(node) !== -1) return false;

    // 4. Otherwise, set node to the previous entry in the stack of open elements and return
    // to step 2. (This will never fail, since the loop will always terminate in the previous step
    // if the top of the stack — an html element — is reached.)
  }
}

Nest.prototype.has_in_scope = function(name) {
  return this.stack.indexOf(name) !== -1
}

Nest.prototype.reconstruct_formatting = function() {
 
  // 1. If there are no entries in the list of active formatting elements,
  // then there is nothing to reconstruct; stop this algorithm.
  if (this.format.length === 0) {
    return;
  }
  
  // 2. If the last (most recently added) entry in the list of active formatting
  // elements is a marker, or if it is an element that is in the stack of
  // open elements, then there is nothing to reconstruct;
  // stop this algorithm.
  var entry_fidx = this.format.length - 1;
  var entry = this.format[entry_fidx];
  if (entry === FMT_MARKER || this.stack.indexOf(entry) !== -1) {
    return;
  }

  // 3. Let entry be the last (most recently added) element in the list of
  // active formatting elements.
  
  var step = 'rewind';
  while (step !== 'done') {

    // 4. Rewind: If there are no entries before entry in the list of
    // active formatting elements, then jump to the step labeled create.
    if (step === 'rewind') {
      if (entry_fidx === 0) {
        step = 'create';
        continue;
      }

      // 5. Let entry be the entry one earlier than entry in the list of
      // active formatting elements.
      entry_fidx--;
      entry = this.format[entry_fidx];

      // 6. If entry is neither a marker nor an element that is also in
      // the stack of open elements, go to the step labeled rewind.
      if (entry !== FMT_MARKER && this.stack.indexOf(entry) === -1) {
        step = 'rewind';
        continue;
      }

      step = 'advance';
      continue;
    }
    else if (step === 'advance') {
      // 7. Advance: Let entry be the element one later than entry in
      // the list of active formatting elements.
      entry_fidx++;
      entry = this.format[entry_fidx];
      step = 'create';
      continue;
    }
    else if (step === 'create') {

      // 8. Create: Insert an HTML element for the token for which the
      // element entry was created, to obtain new element.
      this.enqueue(['open', Buffer('<' + entry + '>')]);
      this.stack.push(entry);

      // 9. Replace the entry for entry in the list with an entry for new element.
      // TODO: try to confirm that there is nothing to do here in html-nest's context

      // 10. If the entry for new element in the list of active formatting elements is not the
      // last entry in the list, return to the step labeled advance.
      if (entry_fidx !== this.format.length - 1) {
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

  // 1. If the current node is an HTML element whose tag name is subject,
  // and the current node is not in the list of active formatting elements,
  // then pop the current node off the stack of open elements, and abort these steps.
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
    var last_marker_idx = this.format.lastIndexOf(FMT_MARKER);
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
