// React 19 removed the global `JSX` namespace in favour of the module-scoped
// `React.JSX`. Re-expose it globally so `JSX.Element` annotations resolve.
import type { JSX as ReactJSX } from 'react'

declare global {
  namespace JSX {
    type Element = ReactJSX.Element
    type ElementType = ReactJSX.ElementType
    type ElementClass = ReactJSX.ElementClass
    type ElementAttributesProperty = ReactJSX.ElementAttributesProperty
    type ElementChildrenAttribute = ReactJSX.ElementChildrenAttribute
    type IntrinsicAttributes = ReactJSX.IntrinsicAttributes
    type IntrinsicClassAttributes<T> = ReactJSX.IntrinsicClassAttributes<T>
    type IntrinsicElements = ReactJSX.IntrinsicElements
    type LibraryManagedAttributes<C, P> = ReactJSX.LibraryManagedAttributes<C, P>
  }
}

export {}
