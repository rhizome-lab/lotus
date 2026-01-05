//! S-expression types.

use serde::{Deserialize, Deserializer, Serialize, Serializer};
use std::collections::HashMap;
use std::marker::PhantomData;

// Type markers for phantom types
/// Type marker for any S-expression type
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Any;
/// Type marker for string S-expressions
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Str;
/// Type marker for number S-expressions
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Num;
/// Type marker for boolean S-expressions
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Bool;
/// Type marker for object S-expressions
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Obj;
/// Type marker for array S-expressions
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Arr;
/// Type marker for null S-expressions
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Null;

/// Private inner enum - cannot be constructed directly from outside this module
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
enum SExprInner {
    Null,
    Bool(bool),
    Number(f64),
    String(String),
    Object(HashMap<String, SExpr>),
    List(Vec<SExpr>),
}

/// An S-expression node with compile-time type checking.
///
/// This is the core intermediate representation for ViwoScript.
/// All script code is represented as nested S-expressions.
///
/// The type parameter `T` is a phantom type that provides compile-time
/// type safety without runtime overhead. Use the type-safe constructors
/// to create S-expressions:
///
/// ```
/// use viwo_ir::SExpr;
///
/// let s = SExpr::string("hello");  // Type: SExpr<Str>
/// let n = SExpr::number(42);       // Type: SExpr<Num>
/// let b = SExpr::bool(true);       // Type: SExpr<Bool>
/// ```
///
/// The opaque inner enum prevents invalid construction like
/// `SExpr::<Num>::bool(true)` at compile time.
#[derive(Debug, Clone, PartialEq)]
pub struct SExpr<T = Any> {
    inner: SExprInner,
    _phantom: PhantomData<T>,
}

// Type-safe constructors for SExpr<Null>
impl SExpr<Null> {
    /// Creates a null value.
    pub fn null() -> Self {
        SExpr {
            inner: SExprInner::Null,
            _phantom: PhantomData,
        }
    }
}

// Type-safe constructors for SExpr<Bool>
impl SExpr<Bool> {
    /// Creates a boolean value.
    pub fn bool(value: bool) -> Self {
        SExpr {
            inner: SExprInner::Bool(value),
            _phantom: PhantomData,
        }
    }
}

// Type-safe constructors for SExpr<Num>
impl SExpr<Num> {
    /// Creates a number value.
    pub fn number(value: impl Into<f64>) -> Self {
        SExpr {
            inner: SExprInner::Number(value.into()),
            _phantom: PhantomData,
        }
    }
}

// Type-safe constructors for SExpr<Str>
impl SExpr<Str> {
    /// Creates a string value.
    pub fn string(value: impl Into<String>) -> Self {
        SExpr {
            inner: SExprInner::String(value.into()),
            _phantom: PhantomData,
        }
    }
}

// Type-safe constructors for SExpr<Obj>
impl SExpr<Obj> {
    /// Creates an object value.
    pub fn object(value: HashMap<String, SExpr>) -> Self {
        SExpr {
            inner: SExprInner::Object(value),
            _phantom: PhantomData,
        }
    }
}

// Type-safe constructors for SExpr<Arr>
impl SExpr<Arr> {
    /// Creates an array/list value.
    pub fn list(value: Vec<SExpr>) -> Self {
        SExpr {
            inner: SExprInner::List(value),
            _phantom: PhantomData,
        }
    }
}

// Static constructors on SExpr<Any>
impl SExpr<Any> {
    /// Creates an opcode call (returns SExpr<Any> since result type depends on opcode).
    pub fn call(opcode: impl Into<String>, args: Vec<SExpr>) -> SExpr<Any> {
        let mut list = vec![SExpr::string(opcode.into()).erase_type()];
        list.extend(args.into_iter().map(|a| a.erase_type()));
        SExpr {
            inner: SExprInner::List(list),
            _phantom: PhantomData,
        }
    }

    /// Casts this SExpr to a specific type.
    ///
    /// This is safe because the type parameter is only a compile-time marker
    /// and doesn't affect the runtime representation.
    pub fn cast_type<T>(self) -> SExpr<T> {
        SExpr {
            inner: self.inner,
            _phantom: PhantomData,
        }
    }
}

// Methods available on any SExpr type
impl<T> SExpr<T> {

    /// Erases the type information, converting to SExpr<Any>.
    /// This is needed when mixing different types in collections.
    pub fn erase_type(self) -> SExpr<Any> {
        SExpr {
            inner: self.inner,
            _phantom: PhantomData,
        }
    }

    /// Returns true if this is a null value.
    pub fn is_null(&self) -> bool {
        matches!(self.inner, SExprInner::Null)
    }

    /// Returns true if this is an opcode call (list starting with a string).
    pub fn is_call(&self) -> bool {
        matches!(&self.inner, SExprInner::List(items) if !items.is_empty() && matches!(&items[0].inner, SExprInner::String(_)))
    }

    /// Returns the opcode name if this is an opcode call.
    pub fn opcode(&self) -> Option<&str> {
        match &self.inner {
            SExprInner::List(items) if !items.is_empty() => {
                if let SExprInner::String(s) = &items[0].inner {
                    Some(s.as_str())
                } else {
                    None
                }
            }
            _ => None,
        }
    }

    /// Returns the arguments if this is an opcode call.
    pub fn args(&self) -> Option<&[SExpr]> {
        match &self.inner {
            SExprInner::List(items) if !items.is_empty() && matches!(&items[0].inner, SExprInner::String(_)) => {
                Some(&items[1..])
            }
            _ => None,
        }
    }

    /// Returns the inner boolean value if this is a Bool.
    pub fn as_bool(&self) -> Option<bool> {
        match &self.inner {
            SExprInner::Bool(b) => Some(*b),
            _ => None,
        }
    }

    /// Returns the inner number value if this is a Number.
    pub fn as_number(&self) -> Option<f64> {
        match &self.inner {
            SExprInner::Number(n) => Some(*n),
            _ => None,
        }
    }

    /// Returns the inner string value if this is a String.
    pub fn as_str(&self) -> Option<&str> {
        match &self.inner {
            SExprInner::String(s) => Some(s.as_str()),
            _ => None,
        }
    }

    /// Returns the inner list if this is a List.
    pub fn as_list(&self) -> Option<&[SExpr]> {
        match &self.inner {
            SExprInner::List(items) => Some(items),
            _ => None,
        }
    }

    /// Returns the inner object if this is an Object.
    pub fn as_object(&self) -> Option<&HashMap<String, SExpr>> {
        match &self.inner {
            SExprInner::Object(map) => Some(map),
            _ => None,
        }
    }
}

// Default implementation
impl Default for SExpr<Any> {
    fn default() -> Self {
        SExpr::null().erase_type()
    }
}

// From implementations (produce SExpr<Any> for compatibility)
impl From<bool> for SExpr<Any> {
    fn from(value: bool) -> Self {
        SExpr::bool(value).erase_type()
    }
}

impl From<i32> for SExpr<Any> {
    fn from(value: i32) -> Self {
        SExpr::number(value).erase_type()
    }
}

impl From<i64> for SExpr<Any> {
    fn from(value: i64) -> Self {
        SExpr::number(value as f64).erase_type()
    }
}

impl From<f64> for SExpr<Any> {
    fn from(value: f64) -> Self {
        SExpr::number(value).erase_type()
    }
}

impl From<&str> for SExpr<Any> {
    fn from(value: &str) -> Self {
        SExpr::string(value).erase_type()
    }
}

impl From<String> for SExpr<Any> {
    fn from(value: String) -> Self {
        SExpr::string(value).erase_type()
    }
}

impl From<Vec<SExpr>> for SExpr<Any> {
    fn from(value: Vec<SExpr>) -> Self {
        SExpr::list(value).erase_type()
    }
}

impl From<HashMap<String, SExpr>> for SExpr<Any> {
    fn from(value: HashMap<String, SExpr>) -> Self {
        SExpr::object(value).erase_type()
    }
}

// Serialization/deserialization support
impl<T> Serialize for SExpr<T> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        self.inner.serialize(serializer)
    }
}

impl<'de, T> Deserialize<'de> for SExpr<T> {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let inner = SExprInner::deserialize(deserializer)?;
        Ok(SExpr {
            inner,
            _phantom: PhantomData,
        })
    }
}
