"use client"; // Required for components using React Context like Google Maps

import { useState } from 'react'; // Import useState
import { APIProvider, Map, AdvancedMarker, InfoWindow } from "@vis.gl/react-google-maps";
import incidentData from "../../public/data/incidents.json"; // Adjust path if needed

// Updated interface to match the actual data structure
interface Incident {
  case_number: string; // Use case_number as the unique key
  date: string;
  time: number;
  offense_type: string;
  location: string;
  latitude: number;
  longitude: number;
  formatted_address: string;
  google_maps_uri: string;
  place_types: string;
  location_interpretation: string;
  // Removed 'id' and 'description'
}

// Function to determine marker color based on location interpretation
const getMarkerColor = (interpretation: string): string => {
  switch (interpretation) {
    case 'SPECIFIC_ADDRESS':
      return 'bg-blue-500'; // Blue for specific address
    case 'INTERSECTION':
    case 'ROUTE':
      return 'bg-orange-500'; // Orange for intersection/route
    case 'GENERAL_AREA':
    default:
      return 'bg-gray-500'; // Gray for general/unknown
  }
};

export default function Home() {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const paloAltoPosition = { lat: 37.4419, lng: -122.1430 }; // Approx center of Palo Alto

  // State to track the index of the selected incident for the InfoWindow
  const [selectedIncidentIndex, setSelectedIncidentIndex] = useState<number | null>(null);

  if (!apiKey) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-red-500 font-bold">
          Error: Google Maps API Key is missing. Please set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY in your .env.local file.
        </p>
      </div>
    );
  }

  // Ensure incidentData is an array before mapping
  const incidents: Incident[] = Array.isArray(incidentData) ? incidentData : [];

  // Find the selected incident object based on the index
  const selectedIncident = selectedIncidentIndex !== null ? incidents[selectedIncidentIndex] : null;

  return (
    <APIProvider apiKey={apiKey}>
      <div style={{ height: "100vh", width: "100%" }}>
        <Map
          defaultCenter={paloAltoPosition}
          defaultZoom={13} // Adjust zoom level as needed
          mapId="PALO_ALTO_INCIDENT_MAP" // Optional: for cloud-based map styling
          gestureHandling={"greedy"} // Allows map interaction without holding Ctrl/Cmd
          disableDefaultUI={true} // Hides default controls for a cleaner look initially
          onClick={() => setSelectedIncidentIndex(null)} // Close InfoWindow when clicking map background
        >
          {/* Render markers for each incident */}
          {incidents.map((incident, index) => {
            const markerColor = getMarkerColor(incident.location_interpretation);
            // Log to console for debugging marker colors
            // console.log(`Incident ${index} (${incident.case_number}): Interpretation='${incident.location_interpretation}', Color Class='${markerColor}'`);
            return (
              <AdvancedMarker
                key={`${incident.case_number}-${index}`}
                position={{ lat: incident.latitude, lng: incident.longitude }}
                onClick={(e) => {
                  e.domEvent.stopPropagation();
                  setSelectedIncidentIndex(index);
                }}
              >
                {/* Custom marker appearance - made slightly larger */}
                <div className={`w-4 h-4 ${markerColor} rounded-full border-2 border-white shadow-sm`}></div>
              </AdvancedMarker>
            );
          })}

          {/* Show InfoWindow when an incident is selected */}
          {selectedIncident && (
            <InfoWindow
              position={{ lat: selectedIncident.latitude, lng: selectedIncident.longitude }}
              // Pixel offset changed to array format [x, y]
              pixelOffset={[0, -15]}
              onCloseClick={() => setSelectedIncidentIndex(null)}
              maxWidth={300}
            >
              {/* InfoWindow Content - Added darker text color */}
              <div className="p-2 text-sm font-sans text-gray-900">
                <h3 className="font-semibold text-base mb-1">{selectedIncident.offense_type}</h3>
                <p><span className="font-medium">Case:</span> {selectedIncident.case_number}</p>
                <p><span className="font-medium">Date:</span> {selectedIncident.date}</p>
                <p><span className="font-medium">Address:</span> {selectedIncident.formatted_address || selectedIncident.location}</p>
                <p><span className="font-medium">Type:</span> {selectedIncident.location_interpretation}</p>
                {selectedIncident.google_maps_uri && (
                    <a
                        href={selectedIncident.google_maps_uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 hover:underline mt-1 block"
                    >
                        View on Google Maps
                    </a>
                )}
                {/* Placeholder for future PDF link */}
                {/* <a href="#" className="text-blue-600 hover:text-blue-800 hover:underline mt-1 block">View Report PDF (Placeholder)</a> */}
              </div>
            </InfoWindow>
          )}
        </Map>
      </div>
    </APIProvider>
  );
}
