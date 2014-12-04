html-nest
=========

Apply the HTML5 Tree Construction algorithm to a stream of `html-tokenize` tokens

[![build status](https://secure.travis-ci.org/jeromew/html-nest.png)](http://travis-ci.org/jeromew/html-nest)

# Example

Simply pipe the output of `html-tokenize` into an `html-nest` stream.

```js
var tokenize = require('html-tokenize');
var nest = require('html-nest');

htmlStream
  .pipe(tokenize())
  .pipe(nest())
  ..
```

# Specification

The whatwg detailed specification of the Tree Construction algorithm can be found on https://html.spec.whatwg.org/multipage/syntax.html#tree-construction

# Philosophy

The goal is to have something that works well with `html-tokenize` and that matches as much as possible of the HTML5 Tree Construction algorithm, while keeping the benefits of streaming.

# Status

Currenly only a subset of the Tree Construction algorithm is implemented. The architecture of the code tries to follow the sections of the specification so it should hopefully be easy to add missing parts in a progressive fashion.

Feel free to send PRs, either for new tests or for implementation of missing parts.

# Notes regarding HTML5 vs streaming

There are some aspects of the Tree Construction algorithm to do not fit well with the streaming approach taken by `html-tokenize` and `html-nest`. We will try and express these limitations here:

 * There will always be an `html` element in the tree. The specification states that if an `html` opening tags is found in the 'in body' insertion mode, its attributes should extend the attributes of the first `html` element. Doing this would basically buffer the whole document in memory. A way to mitigate this could be to send provisional `html` tags
 * The table 'foster parenting' algorithm states that if we find elements inside a table that have nothing to do in the table, they should be reparented just before the table. In order to do this, we have to buffer the tables
 * The misnested tags are rectified by the 'adjacency adoption algorithm'. This algorithm tracks some formating elements (b, i, ..) and re-organizes locally the elements when a misnesting is detected. Sometimes the re-organization is triggered after tokens have already been processed. In order to follow this algorithm, we have to buffer tokens during formatting sections.





