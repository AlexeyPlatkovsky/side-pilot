# SwiftUI Charts Reference

## Availability

- `Chart`, custom axes, `BarMark`, `LineMark`, `AreaMark`, `PointMark`, `RectangleMark`, `RuleMark`: iOS 16+
- `SectorMark`, built-in selection, scrollable axes: iOS 17+
- `BarPlot`, `LinePlot`, `AreaPlot`, function plotting: iOS 18+
- `Chart3D`, Z-axis APIs: iOS 26+

Always check that the file imports `Charts` before using chart types.

```swift
import SwiftUI
import Charts
```

## Core APIs

```swift
// Data models should be Identifiable
struct SalesPoint: Identifiable {
    let id: UUID
    let month: String
    let revenue: Double
}

Chart(sales) { item in
    BarMark(
        x: .value("Month", item.month),
        y: .value("Revenue", item.revenue)
    )
}
```

Use `.value(_, _)` to describe what each axis value means. Labels are reused by axes, legends, and accessibility.

## Chart Types

**BarMark, LineMark, AreaMark, PointMark, RectangleMark, RuleMark** — all iOS 16+

```swift
// Line with interpolation
LineMark(x: .value("Day", day.date), y: .value("Steps", day.count))
    .interpolationMethod(.monotone)

// Threshold line
RuleMark(y: .value("Goal", 10_000))
    .foregroundStyle(.red)

// Pie/donut (iOS 17+)
SectorMark(
    angle: .value("Amount", expense.amount),
    innerRadius: .ratio(0.6),
    angularInset: 2
)
```

## Selection APIs (iOS 17+)

```swift
@State private var selectedDate: Date?

Chart(steps) { day in
    LineMark(x: .value("Day", day.date), y: .value("Steps", day.count))
    if let selectedDate {
        RuleMark(x: .value("Selected Day", selectedDate)).foregroundStyle(.secondary)
    }
}
.chartXSelection(value: $selectedDate)

// Range selection
@State private var selectedWeeks: ClosedRange<Int>?
.chartXSelection(range: $selectedWeeks)
```

## Axis Tweaks

```swift
.chartXAxis {
    AxisMarks(preset: .aligned, position: .bottom, values: .stride(by: .day)) {
        AxisGridLine()
        AxisTick(length: .label)
        AxisValueLabel(format: .dateTime.weekday(.abbreviated))
    }
}
.chartXScale(domain: 0...30)
.chartYScale(domain: 0...100)
```

## Scrollable Axes (iOS 17+)

```swift
Chart(data) { item in
    BarMark(x: .value("Day", item.day), y: .value("Value", item.value))
}
.chartScrollableAxes(.horizontal)
.chartXVisibleDomain(length: 7)
.chartScrollPosition(x: $scrollX)
```

## Categorical Coloring

```swift
BarMark(x: .value("Month", item.month), y: .value("Revenue", item.revenue))
    .foregroundStyle(by: .value("Region", item.region))  // Auto-generates legend
```

**Avoid** applying `.foregroundStyle(.red)` per mark for categorical data.

## Chart3D (iOS 26+)

```swift
if #available(iOS 26, *) {
    Chart3D(points) { point in
        PointMark(
            x: .value("X", point.x),
            y: .value("Y", point.y),
            z: .value("Z", point.z)
        )
    }
    .chart3DPose(.front)
}
```

**Always** gate `Chart3D` with `#available(iOS 26, *)`.

## Best Practices

### Do
- Use semantic `.value(_, _)` labels for axes and accessibility
- Prefer `Identifiable` models for stable chart data identity
- Use `foregroundStyle(by:)` for categorical series (auto-generates legend)
- Use `RuleMark` for goals, thresholds, selected-value indicators
- Gate iOS 17+ APIs with `#available`

### Don't
- Put chart-wide modifiers (e.g., `chartXAxis`) on individual marks
- Apply manual `.foregroundStyle(.color)` per mark for categorical data
- Assume selection returns a model object (it returns the plottable axis value)
