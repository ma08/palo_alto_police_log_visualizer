"use client"; // Required for components using React Context like Google Maps

import { useState, useRef, useEffect, useMemo } from 'react'; // Import useRef, useEffect, useMemo
import { APIProvider, Map, AdvancedMarker, InfoWindow, useMap } from "@vis.gl/react-google-maps"; // Import useMap
import incidentData from "../../public/data/incidents.json"; // Adjust path if needed

// Updated interface to match the actual data structure
interface Incident {
  case_number: string; // Use case_number as the unique key
  date: string;
  time: number;
  offense_type: string;
  offense_category: string;
  location: string;
  latitude: number;
  longitude: number;
  formatted_address: string;
  google_maps_uri: string;
  place_types: string;
  location_interpretation: string;
  police_record_date_str?: string; // Added field for the report date string (e.g., "april-07-2025")
  police_record_date?: string; // Added field for the formatted report date
  // Removed 'id' and 'description'
}

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

// --- NEW: Type for Category Color Map ---
interface CategoryColorMap {
    [key: string]: string;
}

// Inner component to use the useMap hook - MODIFIED Props
function MapContent({ incidentsToDisplay, categoryColorMap }: { incidentsToDisplay: Incident[], categoryColorMap: CategoryColorMap }) {
  const map = useMap();
  const [selectedIncidentIndex, setSelectedIncidentIndex] = useState<number | null>(null);
  const [searchResultPosition, setSearchResultPosition] = useState<LatLngLiteral | null>(null);
  // State to hold details of the *currently selected* place for InfoWindow visibility
  const [selectedPlaceDetails, setSelectedPlaceDetails] = useState<PlaceDetails | null>(null);
  // State to hold details of the *last successfully searched* place for the marker
  const [pinnedPlaceDetails, setPinnedPlaceDetails] = useState<PlaceDetails | null>(null); 
  const searchInputRef = useRef<HTMLInputElement>(null);

  const incidents = incidentsToDisplay;
  const selectedIncident = selectedIncidentIndex !== null ? incidents[selectedIncidentIndex] : null;

  // Function to generate PDF link based on incident date
  const generatePdfLink = (incident: Incident): string => {
    try {
      // First try to use the police_record_date_str from the data if available
      if (incident.police_record_date_str) {
        // It's already in the format we need (e.g., "april-07-2025")
        return `https://www.paloalto.gov/files/assets/public/v/2/police-department/public-information-portal/police-report-log/${incident.police_record_date_str}-police-report-log.pdf`;
      }
      
      // Fall back to parsing the incident.date if police_record_date_str is not available
      // Parse the date string (assuming format like "Jan 1, 2024")
      const date = new Date(incident.date);
      
      // Format the date to match the PDF URL format
      const month = date.toLocaleString('en-US', { month: 'long' }).toLowerCase();
      const day = String(date.getDate()).padStart(2, '0'); // Ensure two digits for day
      const year = date.getFullYear();
      
      // Construct the date string like "april-07-2024"
      const formattedDateStr = `${month}-${day}-${year}`;
      
      // Create the URL in the format shown in the example
      return `https://www.paloalto.gov/files/assets/public/v/2/police-department/public-information-portal/police-report-log/${formattedDateStr}-police-report-log.pdf`;
    } catch (error) {
      // In case of any parsing errors, return the main police log page
      console.error("Error generating PDF link:", error);
      return "https://www.paloalto.gov/Departments/Police/Public-Information-Portal/Police-Report-Log";
    }
  };

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

    autocomplete.addListener('place_changed', () => {
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
        if (window.google && google.maps && google.maps.event) {
             google.maps.event.clearInstanceListeners(autocomplete); // More robust cleanup
             const pacContainers = document.querySelectorAll('.pac-container');
             pacContainers.forEach(container => container.remove());
        }
    };
  }, [map]);

  // Reset selected incident index when incidentsToDisplay changes
  useEffect(() => {
    setSelectedIncidentIndex(null);
  }, [incidentsToDisplay]);

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
          onClick={() => {
              // Close both info windows on map click
              setSelectedIncidentIndex(null);
              setSelectedPlaceDetails(null);
          }}
        >
          {/* Incident Markers - MODIFIED */}
          {incidents.map((incident, index) => {
            const markerColor = categoryColorMap[incident.offense_category] || '#9CA3AF'; // Use map, default to gray
            return (
              <AdvancedMarker
                key={`${incident.case_number}-${incident.police_record_date_str ?? index}`}
                position={{ lat: incident.latitude, lng: incident.longitude }}
                onClick={({ domEvent }) => {
                    domEvent.stopPropagation();
                    setSelectedIncidentIndex(index);
                    setSelectedPlaceDetails(null);
                }}
              >
                {/* Use dynamic background color */}
                <div
                  className={`w-4 h-4 rounded-full border-2 border-white shadow-sm`}
                  style={{ backgroundColor: markerColor }}
                  title={incident.offense_category} // Add tooltip for category on marker hover
                ></div>
              </AdvancedMarker>
            );
          })}

          {/* Search Result Marker - Renders if a position is set */}
          {searchResultPosition && (
              <AdvancedMarker
                  key="search-result"
                  position={searchResultPosition}
                  onClick={(_) => { 
                      _.domEvent.stopPropagation(); 
                      // Re-open the place InfoWindow using the pinned details
                      setSelectedPlaceDetails(pinnedPlaceDetails); 
                      setSelectedIncidentIndex(null); 
                  }}
              >
                  {/* The custom div is removed here to use the default pin */}
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
                  {selectedIncident.police_record_date && (
                    <p className="mt-1"><span className="font-medium">Police Log Date:</span> {selectedIncident.police_record_date}</p>
                  )}
                  <a 
                    href={generatePdfLink(selectedIncident)} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="text-blue-600 hover:text-blue-800 hover:underline mt-1 block"
                  >
                    View Original Police Log
                  </a>
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

// Define the order of severity
const severityOrder = ['High', 'Medium', 'Low', 'Informational/Other', 'Default'];

// Helper function to get the severity level string for a category
const getCategorySeverityLevel = (category: string): string => {
    const lowerCaseCategory = category.toLowerCase();

    if (lowerCaseCategory.includes('violent') || lowerCaseCategory.includes('robbery') || lowerCaseCategory.includes('burglary') || lowerCaseCategory.includes('weapon') || lowerCaseCategory.includes('assault')) {
        return 'High';
    }
    if (lowerCaseCategory.includes('theft') || lowerCaseCategory.includes('fraud') || lowerCaseCategory.includes('vehicle') || lowerCaseCategory.includes('stolen') || lowerCaseCategory.includes('dui') || lowerCaseCategory.includes('narcotic')) {
        return 'Medium';
    }
    if (lowerCaseCategory.includes('property') || lowerCaseCategory.includes('vandalism') || lowerCaseCategory.includes('traffic') || lowerCaseCategory.includes('disturbance') || lowerCaseCategory.includes('trespass') || lowerCaseCategory.includes('public order')) {
        return 'Low';
    }
     if (lowerCaseCategory.includes('admin') || lowerCaseCategory.includes('other') || lowerCaseCategory.includes('warrant') || lowerCaseCategory.includes('arrest') || lowerCaseCategory.includes('lost') || lowerCaseCategory.includes('found') || lowerCaseCategory.includes('suspicious') || lowerCaseCategory.includes('info') || lowerCaseCategory.includes('misc') || lowerCaseCategory.includes('welfare')) {
        return 'Informational/Other';
    }
    return 'Default'; // Should ideally not happen with cleaned categories
};

// Helper function to assign colors based on keywords (can be placed outside the component or inside useMemo)
// REVISED Logic to better match cleaned categories
const assignColorByCategory = (category: string): string => {
    const lowerCaseCategory = category.toLowerCase();

    // High Severity (Explicit Match or Keywords)
    if (lowerCaseCategory.includes('violent') || lowerCaseCategory.includes('robbery') || lowerCaseCategory.includes('burglary') || lowerCaseCategory.includes('weapon') || lowerCaseCategory.includes('assault')) {
        return '#B91C1C'; // Dark Red
    }
    // Medium Severity (Explicit Match or Keywords)
    if (lowerCaseCategory.includes('theft') || lowerCaseCategory.includes('fraud') || lowerCaseCategory.includes('vehicle') || lowerCaseCategory.includes('stolen') || lowerCaseCategory.includes('dui') || lowerCaseCategory.includes('narcotic')) {
        return '#F59E0B'; // Orange
    }
    // -- NEW: Specific Yellow for Property/Disturbance --
    if (lowerCaseCategory.includes('property') || lowerCaseCategory.includes('vandalism') || lowerCaseCategory.includes('disturbance') || lowerCaseCategory.includes('trespass') || lowerCaseCategory.includes('public order')) {
        return '#EAB308'; // Yellow 500
    }
    // Low Severity (Traffic primarily now)
    if (lowerCaseCategory.includes('traffic')) {
        return '#2563EB'; // Blue
    }
    // Informational/Other (Explicit Match or Keywords)
    if (lowerCaseCategory.includes('admin') || lowerCaseCategory.includes('other') || lowerCaseCategory.includes('warrant') || lowerCaseCategory.includes('arrest') || lowerCaseCategory.includes('lost') || lowerCaseCategory.includes('found') || lowerCaseCategory.includes('suspicious') || lowerCaseCategory.includes('info') || lowerCaseCategory.includes('misc') || lowerCaseCategory.includes('welfare')) {
        return '#6B7280'; // Gray
    }
    // Default
    return '#9CA3AF'; // Lighter Gray
};

export default function Home() {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  // --- NEW: State for collapsible sections ---
  const [isHowToUseVisible, setIsHowToUseVisible] = useState(false);
  const [isDisclaimerVisible, setIsDisclaimerVisible] = useState(false);
  const [isFiltersVisible, setIsFiltersVisible] = useState(false); // Default to collapsed

  // --- Filter State ---
  const [incidentDateStart, setIncidentDateStart] = useState('');
  const [incidentDateEnd, setIncidentDateEnd] = useState('');
  const [reportDateStart, setReportDateStart] = useState('');
  const [reportDateEnd, setReportDateEnd] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  // Ensure incidentData is an array - Wrapped in useMemo
  const allIncidents: Incident[] = useMemo(() => Array.isArray(incidentData) ? incidentData : [], []);

  // --- Helper function to parse M/D/YYYY to UTC Date ---
  const parseMDYToUTCDate = (dateString: string | null | undefined): Date | null => {
    if (!dateString) return null;
    const parts = dateString.split('/');
    if (parts.length !== 3) {
      console.warn(`Unexpected date format encountered (expected M/D/YYYY): ${dateString}`);
      return null; // Expect M/D/YYYY
    }

    const month = parseInt(parts[0], 10);
    const day = parseInt(parts[1], 10);
    const year = parseInt(parts[2], 10);

    // Basic validation
    if (isNaN(month) || isNaN(day) || isNaN(year) ||
        month < 1 || month > 12 || day < 1 || day > 31 || year < 1900 || year > 3000) { // Adjusted year range slightly
        console.warn(`Invalid date components parsed from: ${dateString}`);
        return null;
    }

    // Create Date object using UTC values
    // Note: Month is 0-indexed in Date constructor
    const utcDate = new Date(Date.UTC(year, month - 1, day));

    // Double-check that the constructed date matches the input parts,
    // as Date.UTC can sometimes adjust invalid day/month combinations (e.g., Feb 30 becomes Mar 2)
    if (utcDate.getUTCFullYear() !== year ||
        utcDate.getUTCMonth() !== month - 1 ||
        utcDate.getUTCDate() !== day) {
         console.warn(`Date constructor adjusted potentially invalid date components for: ${dateString}`);
         return null; // Treat adjusted dates as invalid for strict parsing
    }

    return utcDate;
  };

  // --- Get Unique Offense Categories - SORTED BY SEVERITY ---
  const uniqueCategories = useMemo(() => {
      const categories = new Set<string>();
      allIncidents.forEach(incident => {
          if (incident.offense_category) { 
              categories.add(incident.offense_category);
          }
      });
      // Convert Set to Array and sort using custom severity logic
      return Array.from(categories).sort((a, b) => {
          const severityA = getCategorySeverityLevel(a);
          const severityB = getCategorySeverityLevel(b);
          const indexA = severityOrder.indexOf(severityA);
          const indexB = severityOrder.indexOf(severityB);

          // If severity is different, sort by severity order
          if (indexA !== indexB) {
              return indexA - indexB;
          }
          // If severity is the same, sort alphabetically
          return a.localeCompare(b);
      });
  }, [allIncidents]); // Recalculate only if allIncidents changes

  // --- NEW: Generate Category Color Map ---
  const categoryColorMap = useMemo(() => {
      const map: CategoryColorMap = {}; // Use interface type
      uniqueCategories.forEach(category => {
          map[category] = assignColorByCategory(category);
      });
      return map;
  }, [uniqueCategories]); // Depends only on the unique categories list

  // --- Filtering Logic ---
   const filteredIncidents = useMemo(() => {
    return allIncidents.filter(incident => {
      // Incident Date Filter (Using robust UTC comparison)
      if (incidentDateStart || incidentDateEnd) {
        const incidentDateUTC = parseMDYToUTCDate(incident.date);

        // If incident date couldn't be parsed reliably, exclude it when filtering by date.
        if (!incidentDateUTC) {
          // Log is handled within parseMDYToUTCDate
          return false;
        }

        if (incidentDateStart) {
          try {
            // Parse filter start date as UTC midnight. Assumes YYYY-MM-DD format from input.
            const startDateUTC = new Date(incidentDateStart + 'T00:00:00Z');
            // Check if the filter date itself is valid
            if (isNaN(startDateUTC.getTime())) {
                 console.warn("Invalid filter start date provided:", incidentDateStart);
                 return false; // Exclude if filter start date is invalid
            }
            // Compare UTC timestamps. Exclude if incident date is strictly BEFORE start date.
            if (incidentDateUTC.getTime() < startDateUTC.getTime()) return false;
          } catch (e) {
            // This catch might not be strictly necessary with the isNaN check, but belt-and-suspenders
            console.warn("Error processing filter start date:", incidentDateStart, e);
            return false; // Exclude on error
          }
        }

        if (incidentDateEnd) {
          try {
             // Parse filter end date as UTC midnight. Assumes YYYY-MM-DD format from input.
            const endDateUTC = new Date(incidentDateEnd + 'T00:00:00Z');
             // Check if the filter date itself is valid
            if (isNaN(endDateUTC.getTime())) {
                 console.warn("Invalid filter end date provided:", incidentDateEnd);
                 return false; // Exclude if filter end date is invalid
            }
            // Compare UTC timestamps. Exclude if incident date is strictly AFTER end date.
            if (incidentDateUTC.getTime() > endDateUTC.getTime()) return false;
          } catch (e) {
             console.warn("Error processing filter end date:", incidentDateEnd, e);
             return false; // Exclude on error
          }
        }
      }

      // Report Date Filter (using police_record_date if available)
      if (reportDateStart || reportDateEnd) {
         // Prioritize police_record_date if it exists and is valid
         const reportDateStr = incident.police_record_date; 
         let canParseReportDate = false;
         let reportDate: Date | null = null;

         if (reportDateStr) {
           try {
             reportDate = new Date(reportDateStr);
             // Check if the date is valid after parsing
             if (!isNaN(reportDate.getTime())) {
               canParseReportDate = true;
               reportDate.setHours(0, 0, 0, 0);
             }
           } catch { /* ignore parse error, might try str next */ } 
         }

         // Fallback to police_record_date_str if parsing police_record_date failed or it didn't exist
         if (!canParseReportDate && incident.police_record_date_str) {
             // Heuristic parsing for "month-dd-yyyy" format
             try {
                 const parts = incident.police_record_date_str.split('-');
                 if (parts.length === 3) {
                     // Simple conversion, assumes "monthname-dd-yyyy"
                     const monthNames = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
                     const monthIndex = monthNames.indexOf(parts[0].toLowerCase());
                     if (monthIndex > -1) {
                         const day = parseInt(parts[1], 10);
                         const year = parseInt(parts[2], 10);
                         if (!isNaN(day) && !isNaN(year)) {
                             reportDate = new Date(year, monthIndex, day);
                             reportDate.setHours(0, 0, 0, 0);
                             canParseReportDate = true;
                         }
                     }
                 }
             } catch(e) {
                  console.warn("Could not parse police_record_date_str:", incident.police_record_date_str, e);
             }
         }


         // If we couldn't get a valid report date, skip the filter for this incident
         if (!canParseReportDate || !reportDate) {
            // If *only* report date filters are active, and we can't parse, exclude it.
             if (reportDateStart || reportDateEnd) return false; 
         } else {
            // Apply filter if we have a valid reportDate
            if (reportDateStart) {
                const startDate = new Date(reportDateStart);
                startDate.setHours(0, 0, 0, 0);
                if (reportDate < startDate) return false;
            }
            if (reportDateEnd) {
                const endDate = new Date(reportDateEnd);
                endDate.setHours(0, 0, 0, 0);
                if (reportDate > endDate) return false;
            }
         }
      }

      // Offense Category Filter - MODIFIED
      if (selectedCategories.length > 0 && !selectedCategories.includes(incident.offense_category)) {
        return false;
      }

      return true; // Include incident if it passes all filters
    });
  }, [allIncidents, incidentDateStart, incidentDateEnd, reportDateStart, reportDateEnd, selectedCategories]);

  // --- Offense Category Checkbox Handler ---
  const handleCategoryChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      const category = event.target.value;
      const isChecked = event.target.checked;

      setSelectedCategories(prevSelected => {
          if (isChecked) {
              return [...prevSelected, category]; // Add category
          } else {
              return prevSelected.filter(cat => cat !== category); // Remove category
          }
      });
  };

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
        <p className="text-center text-sm text-gray-600 mt-1">*Note: The current map data covers incidents reported from February 18, 2025, to April 18, 2025.*</p>
        <p className="text-center text-xs text-blue-600 mt-1">
           <a href="https://github.com/ma08/palo_alto_police_log_visualizer" target="_blank" rel="noopener noreferrer" className="hover:underline">View Source Code on GitHub</a>
        </p>
      </header>

      {/* Main Content Area */}
      <main className="flex-grow container mx-auto p-4 md:p-6 lg:p-8 flex flex-col">

        {/* Context / Usage Note - NOW TOGGLABLE */}
        <div className="mb-4 bg-green-50 border border-green-200 rounded-md text-sm text-green-800 overflow-hidden">
           <button
             onClick={() => setIsHowToUseVisible(!isHowToUseVisible)}
             className="w-full p-3 text-left font-medium flex items-center hover:bg-green-100 focus:outline-none"
           >
             <span className="mr-2">{isHowToUseVisible ? '▲' : '▼'}</span> {/* Icon on the left */}
             <span>How to use <span className="text-xs font-normal text-gray-500">(click to expand/collapse)</span></span>
           </button>
           {isHowToUseVisible && (
             <div className="p-3 border-t border-green-200 space-y-1">
               <p>
                 Use the search bar on the map to find an address or place in Palo Alto. Use the filters below to refine incidents shown on the map. Click dots for details. A standard map pin shows your searched location.
               </p>
               <p>
                 This is a personal project created by <a href="https://sourya.co/" target="_blank" rel="noopener noreferrer" className="font-medium text-indigo-600 hover:underline">Sourya Kakarla</a> as a potentially useful tool during a house hunt. It&apos;s not affiliated with the City of Palo Alto Police Department.
               </p>
             </div>
           )}
        </div>

        {/* Disclaimer Section - NOW TOGGLABLE */}
        <div className="mb-4 bg-orange-50 border border-orange-200 rounded-md text-sm text-orange-800 overflow-hidden">
           <button
             onClick={() => setIsDisclaimerVisible(!isDisclaimerVisible)}
             className="w-full p-3 text-left font-medium flex items-center hover:bg-orange-100 focus:outline-none"
           >
             <span className="mr-2">{isDisclaimerVisible ? '▲' : '▼'}</span> {/* Icon on the left */}
             <span>Disclaimer <span className="text-xs font-normal text-gray-500">(click to expand/collapse)</span></span>
           </button>
           {isDisclaimerVisible && (
             <div className="p-3 border-t border-orange-200">
               <p>
                 The data presented is based on automated processing of public records and may contain errors or omissions. No guarantee of accuracy or completeness is provided. Always consult the official <a href="https://www.paloalto.gov/Departments/Police/Public-Information-Portal/Police-Report-Log" target="_blank" rel="noopener noreferrer" className="font-semibold text-orange-700 underline hover:text-orange-900">Palo Alto Police Report Logs</a> for authoritative information.
               </p>
             </div>
           )}
        </div>

        {/* --- Filter Controls - NOW TOGGLABLE --- */}
        <div className="mb-6 bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
            <button
              onClick={() => setIsFiltersVisible(!isFiltersVisible)}
              className="w-full p-4 text-left text-lg font-semibold text-gray-700 flex items-center hover:bg-gray-50 focus:outline-none"
            >
              <span className="mr-2">{isFiltersVisible ? '▲' : '▼'}</span> {/* Icon on the left */}
              <span>Filter Incidents <span className="text-xs font-normal text-gray-500">(click to expand/collapse)</span></span>
            </button>
            {isFiltersVisible && (
              <div className="p-4 border-t border-gray-200"> {/* Content wrapper */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Incident Date Filter */}
                    <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">Incident Date Range</label>
                        <div className="flex space-x-2">
                            <input
                                type="date"
                                value={incidentDateStart}
                                onChange={(e) => setIncidentDateStart(e.target.value)}
                                className="w-full p-1.5 border border-gray-300 rounded-md text-sm text-gray-700 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                                aria-label="Incident start date"
                            />
                            <input
                                type="date"
                                value={incidentDateEnd}
                                onChange={(e) => setIncidentDateEnd(e.target.value)}
                                className="w-full p-1.5 border border-gray-300 rounded-md text-sm text-gray-700 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                                aria-label="Incident end date"
                                min={incidentDateStart} // Prevent end date being before start date
                            />
                        </div>
                         <button
                            onClick={() => { setIncidentDateStart(''); setIncidentDateEnd(''); }}
                            className="mt-1.5 text-xs text-blue-600 hover:underline"
                         >
                            Clear Dates
                         </button>
                    </div>

                    {/* Report Date Filter */}
                    <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">Police Log Date Range</label>
                        <div className="flex space-x-2">
                            <input
                                type="date"
                                value={reportDateStart}
                                onChange={(e) => setReportDateStart(e.target.value)}
                                className="w-full p-1.5 border border-gray-300 rounded-md text-sm text-gray-700 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                                aria-label="Report start date"
                            />
                            <input
                                type="date"
                                value={reportDateEnd}
                                onChange={(e) => setReportDateEnd(e.target.value)}
                                className="w-full p-1.5 border border-gray-300 rounded-md text-sm text-gray-700 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                                aria-label="Report end date"
                                min={reportDateStart} // Prevent end date being before start date
                            />
                        </div>
                         <button
                            onClick={() => { setReportDateStart(''); setReportDateEnd(''); }}
                            className="mt-1.5 text-xs text-blue-600 hover:underline"
                         >
                             Clear Dates
                         </button>
                    </div>

                    {/* Offense Category Filter - MODIFIED */}
                    <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">Offense Category(s)</label>
                        <div className="max-h-32 overflow-y-auto border border-gray-300 rounded-md p-2 bg-gray-50 text-sm">
                            {uniqueCategories.length > 0 ? (
                                uniqueCategories.map(category => (
                                    <div key={category} className="flex items-center mb-1">
                                        {/* Color Swatch */}
                                        <span
                                            className="w-3 h-3 rounded-sm mr-2 inline-block flex-shrink-0"
                                            style={{ backgroundColor: categoryColorMap[category] || '#9CA3AF' /* Default gray */ }}
                                            title={category} // Tooltip with category name
                                        ></span>
                                        <input
                                            type="checkbox"
                                            id={`category-${category}`}
                                            value={category}
                                            checked={selectedCategories.includes(category)}
                                            onChange={handleCategoryChange}
                                            className="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 mr-2"
                                        />
                                        {/* Allow label to wrap if needed */}
                                        <label htmlFor={`category-${category}`} className="text-gray-700 cursor-pointer break-words">
                                            {category}
                                        </label>
                                    </div>
                                ))
                            ) : (
                                <p className="text-gray-500 italic">No offense categories found.</p>
                            )}
                        </div>
                         <button
                            onClick={() => setSelectedCategories([])}
                            className="mt-1.5 text-xs text-blue-600 hover:underline"
                         >
                             Clear Selection
                         </button>
                    </div>
                </div>
              </div>
            )}
        </div>

        {/* Tab Content */}
        <div className="flex-grow relative"> {/* Added relative positioning for absolute search bar */}
          {/* Map View - Pass filtered incidents AND color map */}
          <APIProvider apiKey={apiKey} libraries={['places']}>
            <div className="relative w-full h-[65vh] md:h-[70vh] rounded-lg shadow-lg overflow-hidden border border-gray-300">
               {/* Pass the filtered incidents AND the color map */}
               <MapContent
                  incidentsToDisplay={filteredIncidents}
                  categoryColorMap={categoryColorMap} // Pass the map here
               />
            </div>
          </APIProvider>
        </div>

        {/* Footer Notes - Remains empty */}
        <footer className="mt-8 text-center text-xs text-gray-500 space-y-2">
        </footer>
      </main>
    </div>
  );
}
