# SwiftUI List Patterns Reference

## ForEach Identity and Stability

**Always provide stable identity for `ForEach`.** Never use `.indices` for dynamic content.

```swift
// GOOD - stable identity via Identifiable
ForEach(users) { user in UserRow(user: user) }

// WRONG - indices can crash on removal
ForEach(users.indices, id: \.self) { index in
    UserRow(user: users[index])
}
```

**Critical**: Ensure **constant number of views per element**. Identifiable IDs must be truly unique.

**Avoid inline filtering:**

```swift
// BAD - unstable identity
ForEach(items.filter { $0.isEnabled }) { item in ... }

// GOOD - prefilter and cache
@State private var enabledItems: [Item] = []
```

**Always convert enumerated sequences to arrays:**

```swift
ForEach(Array(items.enumerated()), id: \.offset) { index, item in
    Text("\(index): \(item)")
}
```

## List Customization

```swift
List(items) { item in
    ItemRow(item: item)
        .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
        .listRowSeparator(.hidden)
}
.listStyle(.plain)
.scrollContentBackground(.hidden)
.background(Color.customBackground)
```

## Pull-to-Refresh

```swift
List(items) { item in ItemRow(item: item) }
    .refreshable { await loadItems() }
```

## Empty States (iOS 17+)

```swift
List { ForEach(searchResults) { item in ItemRow(item: item) } }
    .overlay {
        if searchResults.isEmpty, !searchText.isEmpty {
            ContentUnavailableView.search(text: searchText)
        }
    }
```

## Table (macOS 12+, iOS 16+)

```swift
Table(people) {
    TableColumn("Given Name", value: \.givenName)
    TableColumn("Family Name", value: \.familyName)
    TableColumn("E-Mail Address", value: \.emailAddress)
}
```

### Sortable Table

```swift
@State private var sortOrder = [KeyPathComparator(\Person.givenName)]

Table(people, sortOrder: $sortOrder) {
    TableColumn("Given Name", value: \.givenName)
    TableColumn("Family Name", value: \.familyName)
}
.onChange(of: sortOrder) { _, newOrder in
    people.sort(using: newOrder)
}
```

**Important:** The table does **not** sort data itself — you must re-sort when `sortOrder` changes.

### macOS Table Styles

```swift
Table(people) { /* columns */ }
    .tableStyle(.bordered(alternatesRowBackgrounds: true))
```

## Summary Checklist

- [ ] ForEach uses stable identity (never `.indices` for dynamic content)
- [ ] Identifiable IDs are truly unique across all items
- [ ] Constant number of views per ForEach element
- [ ] No inline filtering in ForEach (prefilter and cache instead)
- [ ] No `AnyView` in list rows
- [ ] Enumerated sequences wrapped in `Array(...)`
- [ ] Use `.refreshable` for pull-to-refresh
- [ ] Use `ContentUnavailableView` for empty states (iOS 17+)
- [ ] Use `.scrollContentBackground(.hidden)` for custom list backgrounds
- [ ] `Table` sorting re-sorts data in `.onChange(of: sortOrder)`
