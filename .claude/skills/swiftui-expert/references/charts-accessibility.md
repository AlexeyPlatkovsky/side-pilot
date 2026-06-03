# Swift Charts Accessibility

## Built-in Accessibility

Swift Charts provides VoiceOver users three rotor actions automatically:
- **Describe Chart** — overview of axes and data series
- **Audio Graph** — sonification where pitch represents data values
- **Chart Detail** — interactive mode for exploring individual data points

## Meaningful Labels

Always use clear, descriptive strings in `.value(_, _)` calls:

```swift
// GOOD
LineMark(x: .value("Date", entry.date), y: .value("Daily Steps", entry.count))

// BAD
LineMark(x: .value("X", entry.date), y: .value("Y", entry.count))
```

## Custom Audio Graphs

For advanced accessibility, conform to `AXChartDescriptorRepresentable`:

```swift
struct StepsChart: View, AXChartDescriptorRepresentable {
    let steps: [DailySteps]

    var body: some View {
        Chart(steps) { day in
            LineMark(x: .value("Date", day.date), y: .value("Steps", day.count))
        }
        .accessibilityChartDescriptor(self)
    }

    func makeChartDescriptor() -> AXChartDescriptor {
        let xAxis = AXDateDataAxisDescriptor(title: "Date", range: steps.first!.date...steps.last!.date, gridlinePositions: [])
        let yAxis = AXNumericDataAxisDescriptor(title: "Steps", range: 0...Double(steps.map(\.count).max() ?? 0), gridlinePositions: []) { "\(Int($0)) steps" }
        let series = AXDataSeriesDescriptor(name: "Daily Steps", isContinuous: true,
            dataPoints: steps.map { .init(x: $0.date, y: Double($0.count)) })
        return AXChartDescriptor(title: "Daily Step Count", summary: nil, xAxis: xAxis, yAxis: yAxis, additionalAxes: [], series: [series])
    }
}
```

## Fallback Strategies

Gate advanced APIs with `#available` and provide a fallback chart:

- iOS 16+: `Chart`, custom axes, scales, core marks, `ChartProxy`
- iOS 17+: `SectorMark`, `chartXSelection`, scrollable axes, `chartGesture`
- iOS 18+: `AreaPlot`, `BarPlot`, `LinePlot`, function plotting
- iOS 26+: `Chart3D`, `SurfacePlot`, Z-axis marks

## Summary Checklist

- [ ] `import Charts` is present in files using chart types
- [ ] Deployment target matches APIs used
- [ ] Chart data models use `Identifiable`
- [ ] All `.value()` labels are descriptive for VoiceOver and Audio Graph
- [ ] `foregroundStyle(by:)` used for categorical series
- [ ] iOS 17+, 18+, 26+ APIs guarded with `#available`
- [ ] Single-value selection uses `chartXSelection(value:)`
- [ ] Range selection uses `chartXSelection(range:)`
