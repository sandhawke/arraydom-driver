
Arraydom DOM Driver
===================

Given a DOM element and a HTML-ish array (as in [arraydom](https://github.com/sandhawke/arraydom)), make the DOM element show the contents of the array.

```js
const domdriver = require('arraydom-driver')
domdriver('elemId', ['p', { $color: 'green' }, 'Hello, World!'])
```

Whenever the tree changes, domdriver updates the DOM to match.

If the tree is derived from some data, whenever the data changes, the tree is recomputed and the DOM is updated appropriately.   For this to work, you need to use one of these three techniques:
* have data sources which emit 'change' events
* call touch() when something changes (in the data or the arraydom tree)
* turn on domdriver polling, like { poll: 100 }

Try the [running examples page](https://rawgit.com/sandhawke/arraydom-driver/master/test/page/index.html) and check out its [source code](https://github.com/sandhawke/arraydom-driver/blob/master/test/page/source.js)

We use the arraydom concept, but this is separate code, since we never actually convert to/from HTML, etc.  (We don't need to include HTML and Markdown parsers.)

## Nice Features

1.  You just operate on a normal, simple JavaScript tree of arrays, and we check periodically to see how it's changed and make a corresponding change to the DOM.  You can tell us when the tree or its underlying data may have changed by calling .touch() or tell us to check every N milliseconds by passing the option { poll: N }

2.  No matter how often you change the tree, call touch, or tell us to poll, we actually only do it when the DOM needs to be displayed. (Right now this just uses the refresh rate, which doesn't tell us if we're scolled off-screen.)

3.  If you have functions in the tree where you would normally put a tagName, we evaluate it for you (with its children provided as arguments).  Its output will be taken as a new tree to use in its place for this run-through.  Its output can contain functions as well, of course, which are also evaluated.  This is how we manage the tree being derived from input data.

4.  If any of the function argument has an .on method, we try .on('change', ...) as setting the touch flag, so that the function is re-evaluated.  Right now, these functions are re-evaluated any time the tree is checked, so polling / touching applies to both the tree and the arguments to these functions.  If the functions are not pure (ie, use inputs other than their argfuments), or the argument don't honor on('change'), then you need to call .touch or turn on polling.

Call dd.stop() if you want this to stop.  If you pass it a value, it becomes the final value for the tree.  Event handlers in that tree will still keep running.


If you need to pass the tree around where you can't have functions (eg postMessage), but you have attached event listeners (via onclick:, oninput:, etc), you can use arraydom.makeSafe and arraydom.makeUnsafe.  