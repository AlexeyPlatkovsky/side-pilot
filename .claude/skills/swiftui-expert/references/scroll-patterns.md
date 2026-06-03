# SwiftUI ScrollView Patterns Reference

## ScrollViewReader for Programmatic Scrolling

```swift
struct ChatView: View {
    @State private var messages: [Message] = []
    private let bottomID = "bottom"

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack {
                    ForEach(messages) { message in
                        MessageRow(message: message).id(message.id)
                    }
                    Color.clear.frame(height: 1).id(bottomID)
                }
            }
            .onChange(of: messages.count) { _, _ in
                withAnimation { proxy.scrollTo(bottomID, anchor: .bottom) }
            }
            .onAppear {
                proxy.scrollTo(bottomID, anchor: .bottom)
            }
        }
    }
}
```

## Scroll Position Tracking

**Avoid** storing scroll position directly — it triggers view updates on every scroll frame. Instead, check thresholds:

```swift
.onPreferenceChange(ScrollOffsetPreferenceKey.self) { value in
    if value < -100 {
        startAnimation = true
    } else {
        startAnimation = false
    }
}
```

## Scroll Transitions (iOS 17+)

```swift
// Scroll-based opacity
ItemCard(item: item)
    .visualEffect { content, geometry in
        let frame = geometry.frame(in: .scrollView)
        let distance = min(0, frame.minY)
        return content.opacity(1 + distance / 200)
    }
```

## Scroll Target Behavior (iOS 17+)

### Paging

```swift
ScrollView(.horizontal) {
    LazyHStack(spacing: 0) {
        ForEach(pages) { page in
            PageView(page: page).containerRelativeFrame(.horizontal)
        }
    }
    .scrollTargetLayout()
}
.scrollTargetBehavior(.paging)
```

### Snap to Items

```swift
ScrollView(.horizontal) {
    LazyHStack(spacing: 16) {
        ForEach(items) { item in
            ItemCard(item: item).frame(width: 280)
        }
    }
    .scrollTargetLayout()
}
.scrollTargetBehavior(.viewAligned)
.contentMargins(.horizontal, 20)
```

## Summary Checklist

- [ ] Use `ScrollViewReader` with stable IDs for programmatic scrolling
- [ ] Always use explicit animations with `scrollTo()`
- [ ] Use `.visualEffect` for scroll-based visual changes (iOS 17+)
- [ ] Use `.scrollTargetBehavior(.paging)` for paging
- [ ] Use `.scrollTargetBehavior(.viewAligned)` for snap-to-item
- [ ] Gate frequent scroll position updates by thresholds
