"use client"; // Required for components using React Context like Google Maps

import { useState, useRef, useEffect } from 'react'; // Import useRef, useEffect
import { APIProvider, Map, AdvancedMarker, InfoWindow, useMap } from "@vis.gl/react-google-maps"; // Import useMap
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

// Define Tab component type
type Tab = 'map' | 'source' | 'methodology';

// Define type for search result position
interface LatLngLiteral {
    lat: number;
    lng: number;
}

// Define approximate bounds for Palo Alto for search biasing
const paloAltoBounds: google.maps.LatLngBoundsLiteral = {
    north: 37.47, // Approx North lat
    south: 37.39, // Approx South lat
    east: -122.07, // Approx East lng
    west: -122.20  // Approx West lng
};

// Define type for selected place details
interface PlaceDetails {
    name: string;
    formattedAddress: string;
}

// Inner component to use the useMap hook
function MapContent() {
  const map = useMap();
  const [selectedIncidentIndex, setSelectedIncidentIndex] = useState<number | null>(null);
  const [searchResultPosition, setSearchResultPosition] = useState<LatLngLiteral | null>(null);
  // State to hold details of the *currently selected* place for InfoWindow visibility
  const [selectedPlaceDetails, setSelectedPlaceDetails] = useState<PlaceDetails | null>(null);
  // State to hold details of the *last successfully searched* place for the marker
  const [pinnedPlaceDetails, setPinnedPlaceDetails] = useState<PlaceDetails | null>(null); 
  const searchInputRef = useRef<HTMLInputElement>(null);

  const incidents: Incident[] = Array.isArray(incidentData) ? incidentData : [];
  const selectedIncident = selectedIncidentIndex !== null ? incidents[selectedIncidentIndex] : null;

  // Initialize Autocomplete
  useEffect(() => {
    if (!map || !searchInputRef.current || !window.google || !window.google.maps.places) {
        return;
    }

    const autocomplete = new google.maps.places.Autocomplete(searchInputRef.current, {
        fields: ["geometry", "name", "formatted_address"],
        bounds: paloAltoBounds,
        strictBounds: false,
        componentRestrictions: { country: 'us' }
    });

    const listener = autocomplete.addListener('place_changed', () => {
        const place = autocomplete.getPlace();
        if (place.geometry?.location && place.name && place.formatted_address) {
            const newPos = {
                lat: place.geometry.location.lat(),
                lng: place.geometry.location.lng()
            };
            const newPlaceDetails = { name: place.name, formattedAddress: place.formatted_address };
            setSearchResultPosition(newPos);
            // Store details for the persistent marker
            setPinnedPlaceDetails(newPlaceDetails);
            // Set details for immediate InfoWindow opening
            setSelectedPlaceDetails(newPlaceDetails);
            // Close incident info window
            setSelectedIncidentIndex(null);
            map.panTo(newPos);
            map.setZoom(15);
        } else {
            // Clear only the *selected* place if search is invalid, keep the pinned one
            setSelectedPlaceDetails(null); 
            // Optionally clear the marker too if search fails completely?
            // setSearchResultPosition(null);
            // setPinnedPlaceDetails(null);
        }
    });

    // Cleanup listener on component unmount
    return () => {
        if (window.google) {
             google.maps.event.removeListener(listener);
             const pacContainers = document.querySelectorAll('.pac-container');
             pacContainers.forEach(container => container.remove());
        }
    };
  }, [map]);


  return (
     <> {/* Use Fragment to return multiple elements */}
        {/* Search Input - Positioned over the map */}
        <input
            ref={searchInputRef}
            type="text"
            placeholder="Search for an address or place..."
            className="absolute top-2 left-1/2 -translate-x-1/2 z-10 w-11/12 max-w-md p-2 rounded-md shadow-md border border-gray-300 bg-white text-gray-900 placeholder:text-gray-500 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
        />
        <Map
          defaultCenter={{ lat: 37.4419, lng: -122.1430 }} // Keep initial center
          defaultZoom={13}
          mapId="PALO_ALTO_INCIDENT_MAP"
          gestureHandling={"greedy"}
          disableDefaultUI={true}
          onClick={(e) => {
              // Close both info windows on map click
              setSelectedIncidentIndex(null);
              setSelectedPlaceDetails(null);
          }}
        >
          {/* Incident Markers */}
          {incidents.map((incident, index) => {
            // Removed markerColor calculation - using fixed color now
            // const markerColor = getMarkerColor(incident.location_interpretation);
            return (
              <AdvancedMarker
                key={`${incident.case_number}-${index}`}
                position={{ lat: incident.latitude, lng: incident.longitude }}
                onClick={(e) => { 
                    e.domEvent.stopPropagation(); 
                    setSelectedIncidentIndex(index); 
                    setSelectedPlaceDetails(null);
                }}
              >
                {/* Changed marker color to reddish-orange */}
                <div className={`w-4 h-4 bg-red-600 rounded-full border-2 border-white shadow-sm`}></div>
              </AdvancedMarker>
            );
          })}

          {/* Search Result Marker - Renders if a position is set */}
          {searchResultPosition && (
              <AdvancedMarker
                  key="search-result"
                  position={searchResultPosition}
                  onClick={(e) => { 
                      e.domEvent.stopPropagation(); 
                      // Re-open the place InfoWindow using the pinned details
                      setSelectedPlaceDetails(pinnedPlaceDetails); 
                      setSelectedIncidentIndex(null); 
                  }}
              >
                  {/* Changed marker color to blue */}
                   <div className="w-5 h-5 bg-blue-600 rounded-full border-2 border-white shadow-md flex items-center justify-center"></div>
              </AdvancedMarker>
          )}

          {/* Incident InfoWindow */}
          {selectedIncident && (
            <InfoWindow
              position={{ lat: selectedIncident.latitude, lng: selectedIncident.longitude }}
              pixelOffset={[0, -15]}
              onCloseClick={() => setSelectedIncidentIndex(null)}
              maxWidth={300}
            >
               <div className="p-2 text-sm font-sans text-gray-900 border-l-4 border-red-500 pl-3">
                  <h3 className="font-semibold text-base mb-1">{selectedIncident.offense_type}</h3>
                  <p><span className="font-medium">Case:</span> {selectedIncident.case_number}</p>
                  <p><span className="font-medium">Date:</span> {selectedIncident.date}</p>
                  <p><span className="font-medium">Address:</span> {selectedIncident.formatted_address || selectedIncident.location}</p>
                  <p><span className="font-medium">Type:</span> {selectedIncident.location_interpretation}</p>
                  {selectedIncident.google_maps_uri && (
                      <a href={selectedIncident.google_maps_uri} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 hover:underline mt-1 block">
                          View on Google Maps
                      </a>
                  )}
               </div>
            </InfoWindow>
          )}

          {/* Place Search Result InfoWindow - Renders if a place is *selected* */}
          {selectedPlaceDetails && searchResultPosition && (
              <InfoWindow
                  position={searchResultPosition}
                  pixelOffset={[0, -15]}
                  // Only clears the *selection*, not the pinned details or position
                  onCloseClick={() => setSelectedPlaceDetails(null)} 
                  maxWidth={300}
              >
                  <div className="p-2 text-sm font-sans text-gray-900">
                      <h3 className="font-semibold text-base mb-1">{selectedPlaceDetails.name}</h3>
                      <p>{selectedPlaceDetails.formattedAddress}</p>
                      <a 
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedPlaceDetails.formattedAddress)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 hover:underline mt-1 block"
                      >
                          View on Google Maps
                      </a>
                  </div>
              </InfoWindow>
          )}
        </Map>
     </> 
  );
}

export default function Home() {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const [activeTab, setActiveTab] = useState<Tab>('map');

  if (!apiKey) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-red-500 font-bold">
          Error: Google Maps API Key is missing. Please set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY in your .env.local file.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-md p-4">
        {/* Responsive text size for header */}
        <h1 className="text-xl sm:text-2xl font-bold text-center text-gray-800">Palo Alto Police Report Log Visualizer</h1>
      </header>

      {/* Main Content Area */}
      <main className="flex-grow container mx-auto p-4 md:p-6 lg:p-8 flex flex-col">

        {/* Tab Navigation - Added horizontal scroll on overflow */}
        <div className="mb-4 border-b border-gray-300 overflow-x-auto">
          <nav className="-mb-px flex space-x-6" aria-label="Tabs">
            <button
              onClick={() => setActiveTab('map')}
              className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm ${activeTab === 'map' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
            >
              Incident Map
            </button>
            <button
              onClick={() => setActiveTab('source')}
              className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm ${activeTab === 'source' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
            >
              Source Data
            </button>
            <button
              onClick={() => setActiveTab('methodology')}
              className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm ${activeTab === 'methodology' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
            >
              Methodology
            </button>
          </nav>
        </div>

        {/* Tab Content */}
        <div className="flex-grow relative"> {/* Added relative positioning for absolute search bar */}
          {/* Map View - Now uses MapContent component */} 
          {activeTab === 'map' && (
            <APIProvider apiKey={apiKey} libraries={['places']}> {/* Request Places library */}
              <div className="relative w-full h-[65vh] md:h-[70vh] rounded-lg shadow-lg overflow-hidden border border-gray-300">
                 <MapContent /> {/* Render the component that uses useMap */} 
              </div>
            </APIProvider>
          )}

          {/* Source Data Tab Content */}
          {activeTab === 'source' && (
            <div className="prose max-w-none p-4 bg-white rounded-lg shadow border border-gray-200 text-gray-900">
              <h2>Source Data</h2>
              <p>
                The incident data visualized on the map is derived from the publicly available Police Report Logs published by the City of Palo Alto Police Department.
              </p>
              <p>
                These logs are typically released daily in PDF format and contain information about police reports processed the previous day.
              </p>
              <p>
                The raw PDF files used for this project can be found on the official City website:
                <br />
                <a href="https://www.paloalto.gov/Departments/Police/Public-Information-Portal/Police-Report-Log" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 hover:underline">
                  https://www.paloalto.gov/Departments/Police/Public-Information-Portal/Police-Report-Log
                </a>
              </p>
              <p>
                Please refer to the source PDFs for the most official and complete information.
              </p>
            </div>
          )}

          {/* Methodology Tab Content */}
          {activeTab === 'methodology' && (
            <div className="prose max-w-none p-4 bg-white rounded-lg shadow border border-gray-200 text-gray-900">
              <h2>Methodology</h2>
              <p>
A high-level overview of the process used to generate the data for this visualization:</p>
              <ol>
                <li><strong>PDF Download:</strong> Scripts periodically download the latest Police Report Log PDFs from the City of Palo Alto website.</li>
                <li><strong>Text Extraction:</strong> The text content is extracted from each PDF file.</li>
                <li><strong>Parsing:</strong> Custom parsing logic identifies and extracts relevant fields (Case #, Date, Time, Offense, Location) for each incident listed in the log.</li>
                <li><strong>Data Cleaning & Structuring:</strong> The extracted data is cleaned (e.g., standardizing date formats) and structured into a consistent format (CSV or JSON).</li>
                <li><strong>Geocoding:</strong> The extracted 'Location' strings are sent to the Google Geocoding API to obtain precise latitude and longitude coordinates, along with a formatted address and location type interpretation (e.g., specific address, intersection).</li>
                <li><strong>Data Aggregation:</strong> Geocoded data from multiple logs is combined into a single dataset (`incidents.json`).</li>
                <li><strong>Visualization:</strong> This website loads the aggregated data and uses the Google Maps API (via `@vis.gl/react-google-maps`) to display the incidents as markers on the interactive map.</li>
              </ol>
              <p>
                Error handling and rate limiting are implemented during the geocoding step. Some locations may not be geocoded successfully if the address is ambiguous or doesn't match Google Maps data.
              </p>
            </div>
          )}
        </div>

        {/* Footer Notes */}
        <footer className="mt-8 text-center text-xs text-gray-500 space-y-2">
          <p>
            This is a personal project created by <a href="https://sourya.co/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Sourya Kakarla</a> as a potentially useful tool during a house hunt in Palo Alto. It is not affiliated with the City of Palo Alto Police Department.
          </p>
          <p>
            <strong>Disclaimer:</strong> The data presented is based on automated processing of public records and may contain errors or omissions. No guarantee of accuracy or completeness is provided. Always consult the official <a href="https://www.paloalto.gov/Departments/Police/Public-Information-Portal/Police-Report-Log" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Palo Alto Police Report Logs</a> for authoritative information.
          </p>
        </footer>
      </main>
    </div>
  );
}
