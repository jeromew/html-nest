html-nest
=========

Apply the HTML5 Tree Construction algorithm to a stream of `html-tokenize` tokens

[![build status](https://secure.travis-ci.org/jeromew/html-nest.png)](http://travis-ci.org/jeromew/html-nest)

# Example

# Specification

The whatwg detailed specification of the Tree Construction algorithm can be found on https://html.spec.whatwg.org/multipage/syntax.html#tree-construction

# Philosophy

The goal is to have something that works well with `html-tokenize` and that matches as much as possible of the HTML5 Tree Construction algorithm, while keeping the benefits of streaming.

# Status

Currenly only a subset of the Tree Construction algorithm is implemented. The architecture of the code tries to follow the sections of the specification so it should hopefully be easy to add missing parts in a progressive fashion.

Feel free to send PRs, either for new tests or for implementation of missing parts.

# Notes regarding the implementation of the Tree Construction algorithm

There are some aspects of the Tree Construction algorithm to do not fit well with the streaming approach taken by `html-tokenize` and `html-nest`. We will try and express these limitations here:

 * There will always be an `html` element in the tree. The specification states that if several `html` opening tags are found, their respective attributes should extend the attributes of the first `html` element. It is currently not possible to do this in `html-nest` since it would basically mean that we need to refrain from emitting any tokens before the whole document has been analyzed by `html-nest`. We would loose all the benefits of streaming.



