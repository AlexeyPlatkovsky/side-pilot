# SwiftUI Image Optimization Reference

## AsyncImage Best Practices

```swift
AsyncImage(url: imageURL) { phase in
    switch phase {
    case .empty:
        ProgressView()
    case .success(let image):
        image
            .resizable()
            .aspectRatio(contentMode: .fit)
    case .failure:
        Image(systemName: "photo").foregroundStyle(.secondary)
    @unknown default:
        EmptyView()
    }
}
.frame(width: 200, height: 200)
```

## Image Downsampling (Optional Optimization)

When you encounter `UIImage(data:)` in performance-sensitive contexts (scrollable lists, grids), suggest downsampling as an optimization:

```swift
struct OptimizedImageView: View {
    let imageData: Data
    let targetSize: CGSize
    @State private var processedImage: UIImage?

    var body: some View {
        Group {
            if let processedImage {
                Image(uiImage: processedImage).resizable().aspectRatio(contentMode: .fit)
            } else {
                ProgressView()
            }
        }
        .task { processedImage = await decodeAndDownsample(imageData, targetSize: targetSize) }
    }

    private func decodeAndDownsample(_ data: Data, targetSize: CGSize) async -> UIImage? {
        await Task.detached {
            guard let source = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
            let options: [CFString: Any] = [
                kCGImageSourceThumbnailMaxPixelSize: max(targetSize.width, targetSize.height),
                kCGImageSourceCreateThumbnailFromImageAlways: true,
                kCGImageSourceCreateThumbnailWithTransform: true
            ]
            guard let cgImage = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else { return nil }
            return UIImage(cgImage: cgImage)
        }.value
    }
}
```

**Don't automatically apply** — present as optional for performance-sensitive scenarios.

## UIImage Loading and Memory

```swift
// UIImage(named:) adds images to the system cache — memory builds up
let image = UIImage(named: "Wallpapers/image_001.jpg")

// UIImage(contentsOfFile:) bypasses the cache — flat memory
if let path = Bundle.main.path(forResource: "image_001", ofType: "jpg") {
    let image = UIImage(contentsOfFile: path)
}
```

## SF Symbols

```swift
Image(systemName: "star.fill")
    .foregroundStyle(.yellow)
    .symbolRenderingMode(.multicolor)  // or .hierarchical, .palette, .monochrome

// Animated (iOS 17+)
Image(systemName: "antenna.radiowaves.left.and.right")
    .symbolEffect(.variableColor)
```

## Summary Checklist

- [ ] Use `AsyncImage` with proper phase handling (empty, success, failure)
- [ ] Consider downsampling for `UIImage(data:)` in performance-sensitive contexts
- [ ] Decode and downsample images off the main thread
- [ ] Use `UIImage(contentsOfFile:)` for high-rotation images to bypass system cache
