import CoreLocation
import MapLibre
import SwiftUI

struct RadarPreviewScreen: View {
    var body: some View {
        ZStack(alignment: .bottom) {
            MapLibrePreview()
                .ignoresSafeArea(edges: .bottom)

            VStack(alignment: .leading, spacing: 8) {
                Text("LIVE RADAR PREVIEW")
                    .font(.caption.monospaced().weight(.semibold))
                    .foregroundStyle(AviTheme.radarCyan)
                Text("MapLibre + OpenStreetMap Positron")
                    .font(.headline)
                    .foregroundStyle(AviTheme.textPrimary)
                Text("Live aircraft, great-circle routes, and indoor layers land in the next iOS phase.")
                    .font(.caption)
                    .foregroundStyle(AviTheme.textSecondary)
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.ultraThinMaterial)
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(AviTheme.border, lineWidth: 1)
            )
            .padding(16)
        }
        .background(AviTheme.background)
    }
}

private struct MapLibrePreview: UIViewRepresentable {
    func makeUIView(context: Context) -> MLNMapView {
        let styleURL = URL(string: "https://tiles.openfreemap.org/styles/positron")
        let mapView = MLNMapView(frame: .zero, styleURL: styleURL)
        mapView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        mapView.setCenter(
            CLLocationCoordinate2D(latitude: 51.47, longitude: -0.4543),
            zoomLevel: 3.4,
            animated: false
        )
        return mapView
    }

    func updateUIView(_ uiView: MLNMapView, context: Context) {}
}
