'use client';
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import events from '@/public/data/events.json';
import { Panel } from '@/app/components/ui/Panel';
import Loading from '@/app/loading';
import { FilterButton } from '@/app/components/ui/FilterButton';
import { FilterDialog } from '@/app/components/ui/FilterDialog';
import { FilterToggleButton } from '@/app/components/ui/FilterToggleButton';
import { EventDetailDialog } from '../components/ui/EventDetailDialog';
import { CommunityDetailDialog } from '@/app/components/ui/CommunityDetailDialog';
import { LocationDetailDialog } from '@/app/components/ui/LocationDetailDialog';
import { saveFilterState, loadFilterState } from '@/app/utils/filterState';
import { CyberDatePicker } from '@/app/components/ui/CyberDatePicker';
import { getCommunityData, getLocationData } from '@/app/utils/dataHelpers';
import { Event, Category, Community, Location } from '@/app/types';
import { getSocialLink } from '@/app/utils/dataHelpers';

// Use imported Category type
interface SimpleCategory {
  id: string;
  name: string;
  count: number;
}

interface CategoryGroup {
  title: string;
  categories: SimpleCategory[];
}

interface FilterOption {
  id: string;
  name: string;
  count?: number;
}

interface FilterGroup {
  title: string;
  options: FilterOption[];
  selectedIds: string[];
  onToggle: (id: string) => void;
}

// Time of day ranges
const timeRanges = {
  morning: { 
    start: 5, 
    end: 11,
    label: 'Morning (5:00 AM - 11:59 AM)'
  },
  afternoon: { 
    start: 12, 
    end: 16,
    label: 'Afternoon (12:00 PM - 4:59 PM)'
  },
  evening: { 
    start: 17, 
    end: 4, // Extends to early morning
    label: 'Evening & Night (5:00 PM - 12:30 AM)'
  }
};

// Date range options
const dateRanges = [
  { id: 'all', name: 'All Dates' },
  { id: 'today', name: 'Today' },
  { id: 'week', name: 'This Week' },
  { id: 'month', name: 'This Month' }
];

// Function to get time of day
const getTimeOfDay = (date: Date): string => {
  const hour = date.getHours();
  if (hour >= timeRanges.morning.start && hour < timeRanges.morning.end) return 'morning';
  if (hour >= timeRanges.afternoon.start && hour < timeRanges.afternoon.end) return 'afternoon';
  // Evening now includes night hours
  if ((hour >= timeRanges.evening.start) || (hour < timeRanges.evening.end)) return 'evening';
  return 'evening'; // Default to evening for any edge cases
};

// Function to normalize text for searching
const normalizeText = (text: string): string => {
  return text?.toLowerCase().trim() || '';
};
  
// Function to check if an event matches the search query
const eventMatchesSearch = (event: any, searchQuery: string): boolean => {
  if (!searchQuery.trim()) return true;
  
  const normalizedQuery = normalizeText(searchQuery);
  const searchTerms = normalizedQuery.split(/\s+/).filter(term => term.length >= 2);
  
  if (searchTerms.length === 0) return true;

  const eventText = normalizeText([
    event.name,
    event.description,
    event.venue?.name,
    event.venue?.address,
    event.organizer?.name,
    event.locationId,
    event.communityId,
    event.category?.name,
    event.type
  ].filter(Boolean).join(' '));

  // All search terms must be present for a match
  return searchTerms.every(term => eventText.includes(term));
};

const ITEMS_PER_PAGE = 20;

// Add community filter types
interface CommunityGroup {
  id: string;
  name: string;
  type: string;
  count: number;
}

// Helper function to safely create a Date object
const safeDate = (dateStr: string): Date => {
  return new Date(dateStr);
};

// Helper function to compare dates safely
const compareDates = (date1: Date, date2: Date): number => {
  return date1.getTime() - date2.getTime();
};

interface FilterState {
  selectedCategories: string[];
  selectedCommunities: string[];
  startDate: string;
  endDate: string;
  searchQuery: string;
  showPastEvents: boolean;
}

// Add helper function for safe date parsing
const parseSafeDate = (dateStr: string | null): Date | null => {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  return isNaN(date.getTime()) ? null : date;
};

// Add helper function to ensure event has all required fields
const ensureCompleteEvent = (event: any): Event => ({
  ...event,
  category: event.type || '', // Use type as category if not present
  price: event.price || {
    amount: 0,
    type: 'Free',
    currency: 'USD',
    details: ''
  },
  capacity: event.capacity || null,
  registrationRequired: event.registrationRequired || false,
  image: event.image || '',
  status: event.status || 'upcoming',
  metadata: event.metadata || {
    source_url: '',
    featured: false
  },
  endDate: event.endDate || event.startDate // Use startDate as endDate if not present
} as Event);

export default function Events() {
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [startDate, setStartDate] = useState<Date | null>(new Date());
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [showPastEvents, setShowPastEvents] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isFilterDialogOpen, setIsFilterDialogOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [visibleItems, setVisibleItems] = useState(ITEMS_PER_PAGE);
  const [hasMore, setHasMore] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [selectedCommunities, setSelectedCommunities] = useState<string[]>([]);
  const [selectedCommunity, setSelectedCommunity] = useState<Community | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
  
  const observerTarget = useRef<HTMLDivElement>(null);

  // Check if we're on mobile
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 1024);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => {
      window.removeEventListener('resize', checkMobile);
    };
  }, []);

  // Save filter state
  useEffect(() => {
    const filterState: FilterState = {
      selectedCategories,
      selectedCommunities,
      startDate: startDate ? startDate.toISOString() : '',
      endDate: endDate ? endDate.toISOString() : '',
      searchQuery,
      showPastEvents
    };
    localStorage.setItem('eventFilters', JSON.stringify(filterState));
  }, [selectedCategories, selectedCommunities, startDate, endDate, searchQuery, showPastEvents]);

  // Load filter state
  useEffect(() => {
    const savedFilters = localStorage.getItem('eventFilters');
    if (savedFilters) {
      const savedState = JSON.parse(savedFilters) as FilterState;
      setSelectedCategories(savedState.selectedCategories || []);
      setSelectedCommunities(savedState.selectedCommunities || []);
      
      // If showPastEvents was saved in the filter state, use that value
      if ('showPastEvents' in savedState) {
        setShowPastEvents(savedState.showPastEvents);
      }
      
      // If we're showing past events, honor the saved startDate, otherwise use today
      if (savedState.showPastEvents && savedState.startDate) {
        setStartDate(new Date(savedState.startDate));
      } else if (!savedState.showPastEvents) {
        setStartDate(new Date());
      }
      
      setEndDate(savedState.endDate ? new Date(savedState.endDate) : null);
      setSearchQuery(savedState.searchQuery || '');
    }
  }, []);

  // Get categories and their subcategories
  const categoryGroups = useMemo(() => {
    const categoryMap = new Map<string, SimpleCategory>();
    
    // First pass: collect all categories and their counts
    events.events.forEach(event => {
      // Handle event type as main category
      if (event.type) {
        if (!categoryMap.has(event.type)) {
          categoryMap.set(event.type, {
            id: event.type,
            name: event.type,
            count: 0
          });
        }
        const category = categoryMap.get(event.type)!;
        category.count++;
      }

      // Handle category if it exists
      if (event.category && typeof event.category === 'object' && 'id' in event.category && 'name' in event.category) {
        const categoryObj = event.category as unknown as Category;
        if (!categoryMap.has(categoryObj.id)) {
          categoryMap.set(categoryObj.id, {
            id: categoryObj.id,
            name: categoryObj.name,
            count: 0
          });
        }
        const category = categoryMap.get(categoryObj.id)!;
        category.count++;
      }
    });

    // Group categories
    const mainCategories: CategoryGroup[] = [];
    const academicSubcategories: SimpleCategory[] = [];

    categoryMap.forEach((cat) => {
      if (cat.name === 'Academic') {
        academicSubcategories.push({
          id: cat.id,
          name: cat.name,
          count: cat.count
        });
      } else {
        mainCategories.push({
          title: cat.name,
          categories: [cat]
        });
      }
    });

    return mainCategories
      .sort((a, b) => b.categories[0].count - a.categories[0].count)
      .map(cat => ({
        ...cat,
        categories: cat.categories.sort((a, b) => b.count - a.count)
      }));
  }, []);

  // Update communityGroups calculation
  const communityGroups = useMemo(() => {
    const communityMap = new Map<string, CommunityGroup>();
    
    // Only count upcoming events for filter counts
    const now = new Date();
    const upcomingEvents = events.events.filter(event => {
      const eventDate = parseSafeDate(event.startDate);
      return eventDate ? eventDate >= now : false;
    });
    
    upcomingEvents.forEach(event => {
      // Primary community
      const community = getCommunityData(event.communityId);
      if (community) {
        if (!communityMap.has(community.id)) {
          communityMap.set(community.id, {
            id: community.id,
            name: community.name,
            type: community.type,
            count: 0
          });
        }
        communityMap.get(community.id)!.count++;
      }
      
      // Secondary communities (from metadata.associated_communities)
      const metadata = event.metadata as { associated_communities?: string[] };
      if (metadata?.associated_communities) {
        metadata.associated_communities.forEach((communityId: string) => {
          const secondaryCommunity = getCommunityData(communityId);
          if (secondaryCommunity && communityId !== event.communityId) {
            if (!communityMap.has(communityId)) {
              communityMap.set(communityId, {
                id: communityId,
                name: secondaryCommunity.name,
                type: secondaryCommunity.type,
                count: 0
              });
            }
            communityMap.get(communityId)!.count++;
          }
        });
      }
    });

    return Array.from(communityMap.values())
      .sort((a, b) => b.count - a.count);
  }, []);

  // Update filteredEvents logic
  const filteredEvents = useMemo(() => events.events.filter(event => {
    // Filter out past events if showPastEvents is false
    if (!showPastEvents) {
      const now = new Date();
      now.setHours(0, 0, 0, 0); // Reset to start of today
      const eventStartDate = parseSafeDate(event.startDate);
      if (!eventStartDate || eventStartDate < now) {
        return false;
      }
    }

    // Category filter
    if (selectedCategories.length > 0) {
      const eventCategories = [
        event.type,
        event.category && typeof event.category === 'object' && 'name' in event.category 
          ? (event.category as unknown as Category).name 
          : undefined
      ].filter(Boolean);
      if (!selectedCategories.some(cat => eventCategories.includes(cat))) {
        return false;
      }
    }

    // Community filter
    if (selectedCommunities.length > 0 && !selectedCommunities.includes(event.communityId)) {
      return false;
    }

    // Date filter
    if (startDate || endDate) {
      const eventStartDate = parseSafeDate(event.startDate);
      const eventEndDate = parseSafeDate(event.endDate);
      
      if (startDate && eventStartDate && eventStartDate < startDate) {
        return false;
      }
      if (endDate && eventEndDate && eventEndDate > endDate) {
        return false;
      }
    }

    // Search filter
    if (searchQuery && !eventMatchesSearch(event, searchQuery)) {
      return false;
    }

    return true;
  }), [events.events, selectedCategories, selectedCommunities, startDate, endDate, searchQuery, showPastEvents]);

  // Update sortedEvents logic
  const sortedEvents = useMemo(() => {
    return [...filteredEvents].sort((a, b) => {
      const dateA = parseSafeDate(a.startDate);
      const dateB = parseSafeDate(b.startDate);
      if (!dateA || !dateB) return 0;
      return dateA.getTime() - dateB.getTime();
    });
  }, [filteredEvents]);

  // Update the load more function for infinite scroll
  const handleLoadMore = useCallback(() => {
    if (isLoadingMore) return;
    
    setIsLoadingMore(true);
    // Use a short timeout to avoid blocking the UI
    setTimeout(() => {
      setVisibleItems(prev => {
        const nextItems = prev + ITEMS_PER_PAGE;
        // Check if we have more items to show
        setHasMore(nextItems < sortedEvents.length);
        return nextItems;
      });
      setIsLoadingMore(false);
    }, 300);
  }, [sortedEvents.length, isLoadingMore]);

  // Reset visible items when filters change
  useEffect(() => {
    // Reset to initial page of items whenever filters change
    setVisibleItems(ITEMS_PER_PAGE);
    setHasMore(sortedEvents.length > ITEMS_PER_PAGE);
    setIsLoadingMore(false);
  }, [sortedEvents.length]);

  // Initialize the loading state
  useEffect(() => {
    // Initial loading state
    setIsLoading(true);
    
    // Short timeout to simulate data loading
    setTimeout(() => {
      setIsLoading(false);
      // Check if we need to enable infinite scrolling
      setHasMore(sortedEvents.length > ITEMS_PER_PAGE);
    }, 500);
  }, [sortedEvents.length]);

  // Implement infinite scroll using Intersection Observer
  useEffect(() => {
    // Don't set up observer while initial loading is happening
    if (isLoading || !observerTarget.current) return;
    
    console.log("Setting up intersection observer, isMobile:", isMobile);
    
    const observer = new IntersectionObserver(
      entries => {
        const [entry] = entries;
        console.log("Intersection observed:", entry.isIntersecting);
        if (entry.isIntersecting && hasMore && !isLoadingMore) {
          console.log("Loading more events...");
          handleLoadMore();
        }
      },
      { 
        threshold: isMobile ? 0.1 : 0.2,
        rootMargin: isMobile ? '300px' : '200px' 
      }
    );

    // Check if already in viewport on initial load (important!)
    const checkInitialIntersection = () => {
      if (observerTarget.current) {
        const rect = observerTarget.current.getBoundingClientRect();
        const isInViewport = (
          rect.top >= 0 &&
          rect.left >= 0 &&
          rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
          rect.right <= (window.innerWidth || document.documentElement.clientWidth)
        );
        
        console.log("Initial check - target in viewport:", isInViewport);
        if (isInViewport && hasMore && !isLoadingMore) {
          handleLoadMore();
        }
      }
    };
    
    // Run initial check
    checkInitialIntersection();

    // Then observe for future intersections
    observer.observe(observerTarget.current);
    
    return () => {
      if (observerTarget.current) {
        observer.unobserve(observerTarget.current);
      }
    };
  }, [observerTarget, hasMore, isLoadingMore, handleLoadMore, isMobile, isLoading]);

  // Handle events, communities, and locations selection
  const handleEventClick = (e: React.MouseEvent, event: any) => {
    e.preventDefault();
    setSelectedEvent(ensureCompleteEvent(event));
  };

  const handleCommunityClick = (communityId: string) => {
    const communityData = getCommunityData(communityId);
    if (communityData) {
      setSelectedEvent(null);
      setSelectedCommunity(communityData);
    }
  };

  const handleLocationClick = (locationId: string) => {
    const locationData = getLocationData(locationId);
    if (locationData) {
      setSelectedEvent(null);
      setSelectedLocation(locationData);
    }
  };

  if (isLoading) {
    return <Loading />;
  }

  return (
    <main className="page-layout">

      {/* Filter Toggle Button (Mobile Only) */}
      {isMobile && (
        <FilterToggleButton 
          isActive={isFilterDialogOpen}
          onClick={() => setIsFilterDialogOpen(!isFilterDialogOpen)}
          resultCount={sortedEvents.length}
        />
      )}

      <div className="events-layout">
        {/* Left Column - Event List */}
        <div className="events-list">
          <Panel title={`NYC EVENTS (${sortedEvents.length})`} systemId="EVT-001">
            <div className="event-cards">
              {sortedEvents.slice(0, visibleItems).map(event => {
                const community = getCommunityData(event.communityId);
                const location = getLocationData(event.locationId);
                const eventDate = parseSafeDate(event.startDate);
                
                if (!eventDate) return null; // Skip events with invalid dates
                
                return (
                  <div 
                    key={event.id} 
                    className="event-card" 
                    onClick={(e) => handleEventClick(e, event)}
                  >
                    {/* Date Badge */}
                    <div className="event-date">
                      <div className="date-month">{eventDate.toLocaleString('en-US', { month: 'short' }).toUpperCase()}</div>
                      <div className="date-day">{eventDate.getDate()}</div>
                    </div>
                    
                    {/* Event Content */}
                    <div className="event-content">
                      <h3 className="event-name">{event.name}</h3>
                      <div className="event-time">{eventDate.toLocaleString('en-US', { hour: 'numeric', minute: 'numeric', hour12: true })}</div>
                      
                      <div className="event-details">
                        {community && (
                          <div className="detail-row">
                            <span className="detail-icon">⚡</span>
                            <button 
                              className="detail-link"
                              onClick={(e) => handleCommunityClick(event.communityId)}
                            >
                              {community.name}
                            </button>
                          </div>
                        )}
                        
                        {location && (
                          <div className="detail-row">
                            <span className="detail-icon">◎</span>
                            <button 
                              className="detail-link"
                              onClick={(e) => handleLocationClick(event.locationId)}
                            >
                              {location.name}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {/* Featured Badge */}
                    {event.metadata?.featured && (
                      <div className="featured-badge">Featured</div>
                    )}
                  </div>
                );
              })}
              
              {/* Infinite Scroll Trigger */}
              {hasMore && (
                <div 
                  ref={observerTarget} 
                  className="infinite-scroll-trigger"
                >
                  {isLoadingMore && (
                    <div className="loading-indicator">
                      <span className="loading-dot"></span>
                      <span className="loading-dot"></span>
                      <span className="loading-dot"></span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </Panel>
        </div>

        {/* Right Column - Filters */}
        <div className={`filters-section ${isMobile ? 'desktop-only' : ''}`}>
          <Panel title="FILTERS" systemId="EVT-FIL-001" variant="secondary">
            <div className="filters-content">
              {/* Search Input */}
              <div className="filter-group">
                <input
                  type="text"
                  placeholder="Search events..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setVisibleItems(ITEMS_PER_PAGE);
                  }}
                  className="search-input"
                />
              </div>

              {/* Past Events Toggle */}
              <div className="filter-group">
                <button 
                  className={`past-events-toggle ${showPastEvents ? 'active' : ''}`}
                  onClick={() => {
                    setShowPastEvents(!showPastEvents);
                    // If toggling off, reset startDate to today
                    if (showPastEvents) {
                      setStartDate(new Date());
                    } else {
                      // If toggling on, clear the date filter
                      setStartDate(null);
                    }
                    setVisibleItems(ITEMS_PER_PAGE);
                  }}
                >
                  {showPastEvents ? 'HIDE PAST EVENTS' : 'SHOW PAST EVENTS'}
                </button>
              </div>

              {/* Date Range Filters */}
              <div className="filter-group">
                <h3 className="filter-title">DATE RANGE</h3>
                <div className="date-filters">
                  <CyberDatePicker
                    selectedDate={startDate}
                    onChange={(date) => {
                      setStartDate(date);
                      setVisibleItems(ITEMS_PER_PAGE);
                    }}
                    label="Start Date"
                    placeholder="FROM"
                  />
                  <CyberDatePicker
                    selectedDate={endDate}
                    onChange={(date) => {
                      setEndDate(date);
                      setVisibleItems(ITEMS_PER_PAGE);
                    }}
                    label="End Date"
                    placeholder="TO"
                  />
                </div>
              </div>

              {/* Categories Filter */}
              <div className="filter-group">
                <h3 className="filter-title">CATEGORIES</h3>
                <div className="filter-options">
                  {categoryGroups.map(category => (
                    <div key={category.title} className="category-group">
                      <FilterButton
                        label={category.title}
                        count={category.categories[0].count}
                        isActive={selectedCategories.includes(category.title)}
                        onClick={() => {
                          setSelectedCategories(prev => {
                            const newSelection = prev.includes(category.title)
                              ? prev.filter(c => c !== category.title)
                              : [...prev, category.title];
                            
                            // Reset to first page of items
                            setVisibleItems(ITEMS_PER_PAGE);
                            return newSelection;
                          });
                        }}
                        variant='compact'
                      />
                      
                      {/* Show subcategories if parent is selected */}
                      {selectedCategories.includes(category.title) && category.categories.slice(1).map(sub => (
                        <FilterButton
                          key={sub.id}
                          label={sub.name}
                          count={sub.count}
                          isActive={selectedCategories.includes(sub.id)}
                          onClick={() => {
                            setSelectedCategories(prev => {
                              const newSelection = prev.includes(sub.id)
                                ? prev.filter(c => c !== sub.id)
                                : [...prev, sub.id];
                              
                              // Reset to first page of items
                              setVisibleItems(ITEMS_PER_PAGE);
                              return newSelection;
                            });
                          }}
                          variant='compact'
                        />
                      ))}
                    </div>
                  ))}
                </div>
              </div>

              {/* Add Community Filter Section */}
              <div className="filter-group">
                <h3 className="filter-title">COMMUNITIES</h3>
                <div className="filter-options">
                  {communityGroups.map(community => (
                    <FilterButton
                      key={community.id}
                      label={`${community.name} (${community.type})`}
                      count={community.count}
                      isActive={selectedCommunities.includes(community.id)}
                      onClick={() => {
                        // Create a new array to trigger state update and reset visibleItems
                        setSelectedCommunities(prev => {
                          // First, create the new array
                          const newSelection = prev.includes(community.id) 
                            ? prev.filter(c => c !== community.id) 
                            : [...prev, community.id];
                          
                          // Reset items to initial page
                          setTimeout(() => {
                            setVisibleItems(ITEMS_PER_PAGE);
                          }, 0);
                          
                          return newSelection;
                        });
                      }}
                      variant='compact'
                    />
                  ))}
                </div>
              </div>

              {/* Clear Filters Button */}
              {(selectedCategories.length > 0 || 
                selectedCommunities.length > 0 ||
                startDate || 
                endDate || 
                searchQuery || 
                showPastEvents) && (
                <button 
                  className="clear-filters-button"
                  onClick={() => {
                    setSelectedCategories([]);
                    setSelectedCommunities([]);
                    setStartDate(new Date()); // Reset to today
                    setEndDate(null);
                    setSearchQuery('');
                    setShowPastEvents(false); // Reset to hide past events
                    setVisibleItems(ITEMS_PER_PAGE);
                  }}
                >
                  CLEAR ALL FILTERS
                </button>
              )}
            </div>
          </Panel>
        </div>
      </div>

      {/* Event Detail Dialog */}
      <EventDetailDialog
        event={selectedEvent}
        isOpen={selectedEvent !== null}
        onClose={() => setSelectedEvent(null)}
        onCommunityClick={handleCommunityClick}
        onLocationClick={handleLocationClick}
      />

      {/* Community Detail Dialog */}
      <CommunityDetailDialog
        community={selectedCommunity}
        isOpen={selectedCommunity !== null}
        onClose={() => setSelectedCommunity(null)}
        onEventSelect={(event) => {
          setSelectedCommunity(null);
          setSelectedEvent(ensureCompleteEvent(event));
        }}
        onLocationSelect={(location) => {
          setSelectedCommunity(null);
          setSelectedLocation(location);
        }}
      />

      {/* Location Detail Dialog */}
      <LocationDetailDialog
        location={selectedLocation}
        isOpen={selectedLocation !== null}
        onClose={() => setSelectedLocation(null)}
        onEventSelect={(event) => {
          setSelectedLocation(null);
          setSelectedEvent(ensureCompleteEvent(event));
        }}
      />

      {/* Mobile Filter Dialog */}
      {isMobile && (
        <FilterDialog
          title="EVENT FILTERS"
          systemId="EVT-FIL-002"
          isOpen={isFilterDialogOpen}
          onClose={() => setIsFilterDialogOpen(false)}
          filterGroups={[
            {
              title: "CATEGORIES",
              options: categoryGroups.flatMap(group => group.categories),
              selectedIds: selectedCategories,
              onToggle: (id) => {
                setSelectedCategories(prev => {
                  return prev.includes(id)
                    ? prev.filter(c => c !== id)
                    : [...prev, id];
                });
                setVisibleItems(ITEMS_PER_PAGE);
              },
              layout: 'list'
            },
            {
              title: "COMMUNITIES",
              options: communityGroups.map(community => ({
                id: community.id,
                name: `${community.name} (${community.type})`,
                count: community.count
              })),
              selectedIds: selectedCommunities,
              onToggle: (id) => {
                setSelectedCommunities(prev => {
                  return prev.includes(id)
                    ? prev.filter(c => c !== id)
                    : [...prev, id];
                });
                setVisibleItems(ITEMS_PER_PAGE);
              },
              layout: 'list'
            }
          ]}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          resultCount={sortedEvents.length}
          startDate={startDate}
          endDate={endDate}
          onStartDateChange={(date) => {
            setStartDate(date);
            setVisibleItems(ITEMS_PER_PAGE);
          }}
          onEndDateChange={(date) => {
            setEndDate(date);
            setVisibleItems(ITEMS_PER_PAGE);
          }}
          showPastEvents={showPastEvents}
          onPastEventsToggle={() => {
            setShowPastEvents(!showPastEvents);
            // If toggling off, reset startDate to today
            if (showPastEvents) {
              setStartDate(new Date());
            } else {
              // If toggling on, clear the date filter
              setStartDate(null);
            }
            setVisibleItems(ITEMS_PER_PAGE);
          }}
          onClearAll={() => {
            setSelectedCategories([]);
            setSelectedCommunities([]);
            setStartDate(new Date()); // Reset to today
            setEndDate(null);
            setSearchQuery('');
            setShowPastEvents(false); // Reset to hide past events
            setVisibleItems(ITEMS_PER_PAGE);
          }}
        />
      )}

      <style jsx>{`
        .page-layout {
          display: flex;
          flex-direction: column;
          height: 100vh;
          overflow: hidden;
        }

        .events-layout {
          display: grid;
          grid-template-columns: 1fr 320px;
          gap: 1rem;
          padding: 1rem;
          flex: 1;
          min-height: 0;
        }

        .events-list {
          min-height: 0;
          overflow: hidden;
        }

        .event-cards {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 1rem;
          width: 100%;
        }

        .event-card {
          position: relative;
          display: flex;
          border: 1px solid var(--terminal-color);
          background: rgba(0, 23, 57, 0.7);
          cursor: pointer;
          overflow: hidden;
          transition: border-color 0.2s ease;
        }

        .event-card:hover {
          border-color: var(--nyc-orange);
        }

        .event-date {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 0.75rem;
          background: rgba(0, 20, 40, 0.5);
          min-width: 60px;
          text-align: center;
        }

        .date-month {
          color: var(--nyc-orange);
          font-size: 0.8rem;
          letter-spacing: 1px;
          font-family: var(--font-mono);
        }

        .date-day {
          font-size: 1.5rem;
          font-weight: bold;
          color: var(--nyc-white);
          line-height: 1;
        }

        .event-content {
          flex: 1;
          padding: 0.75rem;
          display: flex;
          flex-direction: column;
        }

        .event-name {
          color: var(--nyc-white);
          margin: 0 0 0.5rem 0;
          font-size: 1rem;
          line-height: 1.3;
        }

        .event-time {
          font-family: var(--font-mono);
          color: var(--terminal-color);
          font-size: 0.85rem;
          margin-bottom: 0.75rem;
        }

        .event-details {
          margin-top: auto;
        }

        .detail-row {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 0.35rem;
        }

        .detail-icon {
          color: var(--nyc-orange);
          font-size: 0.9rem;
        }

        .detail-link {
          background: transparent;
          border: none;
          color: var(--nyc-white);
          font-size: 0.9rem;
          padding: 0;
          text-align: left;
          cursor: pointer;
        }

        .detail-link:hover {
          color: var(--nyc-orange);
        }

        .featured-badge {
          position: absolute;
          top: 0;
          right: 0;
          background: var(--nyc-orange);
          color: var(--background);
          font-size: 0.7rem;
          padding: 0.2rem 0.5rem;
          font-family: var(--font-mono);
        }

        .load-more-container {
          grid-column: 1 / -1;
          display: flex;
          justify-content: center;
          padding: 1.5rem 0;
        }

        .load-more-button {
          background: rgba(0, 56, 117, 0.3);
          border: 1px solid var(--terminal-color);
          color: var(--terminal-color);
          font-family: var(--font-mono);
          font-size: 0.9rem;
          padding: 0.75rem 1.5rem;
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          min-width: 200px;
        }

        .load-more-button:hover:not(:disabled) {
          background: rgba(0, 56, 117, 0.5);
          border-color: var(--nyc-orange);
          color: var(--nyc-orange);
        }

        .load-more-button:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .loading-indicator {
          display: flex;
          gap: 0.5rem;
          align-items: center;
        }

        .loading-dot {
          width: 8px;
          height: 8px;
          background-color: var(--nyc-orange);
          border-radius: 50%;
          display: inline-block;
          animation: pulse 1.2s infinite ease-in-out;
        }

        .loading-dot:nth-child(2) {
          animation-delay: 0.2s;
        }

        .loading-dot:nth-child(3) {
          animation-delay: 0.4s;
        }

        @keyframes pulse {
          0%, 100% {
            transform: scale(0.5);
            opacity: 0.5;
          }
          50% {
            transform: scale(1);
            opacity: 1;
          }
        }

        .filters-section {
          min-height: 0;
          overflow: visible;
          position: sticky;
          top: 1rem;
          max-height: calc(100vh - 2rem);
          display: flex;
          flex-direction: column;
        }

        .filters-content {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
          overflow-y: auto;
          padding-right: 0.5rem;
          max-height: calc(100vh - 6rem);
          scrollbar-width: thin;
          scrollbar-color: var(--nyc-orange) rgba(0, 56, 117, 0.3);
        }

        .filters-content::-webkit-scrollbar {
          width: 6px;
        }

        .filters-content::-webkit-scrollbar-track {
          background: rgba(0, 56, 117, 0.3);
        }

        .filters-content::-webkit-scrollbar-thumb {
          background-color: var(--nyc-orange);
          border-radius: 3px;
        }

        .filter-group {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .filter-title {
          color: var(--terminal-color);
          font-size: 0.8rem;
          margin: 0;
          font-family: var(--font-mono);
          position: sticky;
          top: 0;
          background: var(--panel-bg);
          padding: 0.5rem 0;
          z-index: 1;
        }

        .filter-options {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          padding-left: 0;
        }

        .search-input {
          width: 100%;
          padding: 0.5rem 1rem;
          background: rgba(0, 56, 117, 0.3);
          border: 1px solid var(--nyc-orange);
          color: var(--nyc-white);
          font-family: var(--font-mono);
          font-size: 0.9rem;
        }

        .search-input::placeholder {
          color: var(--terminal-color);
          opacity: 0.5;
        }

        .date-filters {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .clear-filters-button {
          width: 100%;
          padding: 0.5rem;
          background: rgba(0, 56, 117, 0.3);
          border: 1px solid var(--terminal-color);
          color: var(--terminal-color);
          font-family: var(--font-mono);
          font-size: 0.8rem;
          cursor: pointer;
          transition: all 0.2s ease;
          margin-top: 0.5rem;
        }

        .clear-filters-button:hover {
          background: rgba(0, 56, 117, 0.5);
          border-color: var(--nyc-orange);
          color: var(--nyc-orange);
        }

        .category-group {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          width: 100%;
        }

        .event-description {
          margin-top: 0.5rem;
          color: var(--nyc-white);
          opacity: 0.7;
          font-size: 0.9rem;
          line-height: 1.4;
        }

        .event-detail {
          display: flex;
          flex-direction: column;
          gap: 2rem;
        }

        .detail-section {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .detail-section h3 {
          color: var(--terminal-color);
          font-family: var(--font-mono);
          font-size: 0.9rem;
          margin: 0;
        }

        .detail-section p {
          color: var(--nyc-white);
          font-size: 1rem;
          margin: 0;
          line-height: 1.5;
        }

        .venue-address {
          color: var(--nyc-orange);
          font-family: var(--font-mono);
          font-size: 0.9rem;
        }

        .detail-categories {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
        }

        .detail-categories .category-tag {
          font-size: 0.8rem;
        }

        .event-community,
        .event-location {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-top: 0.5rem;
        }
        
        .community-label,
        .location-label {
          color: var(--terminal-color);
          font-size: 0.8rem;
          font-family: var(--font-mono);
        }
        
        .community-link,
        .location-link {
          background: rgba(0, 56, 117, 0.2);
          border: 1px solid var(--terminal-color);
          color: var(--nyc-white);
          font-size: 0.9rem;
          padding: 0.25rem 0.5rem;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
        }
        
        .community-link:hover,
        .location-link:hover {
          background: rgba(0, 56, 117, 0.4);
          border-color: var(--nyc-orange);
        }
        
        .community-type {
          color: var(--terminal-color);
          font-size: 0.8rem;
        }

        .featured-badge {
          background: var(--accent);
          color: var(--background);
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
          font-size: 0.8rem;
          font-weight: 500;
        }

        .event-metadata {
          display: flex;
          gap: 1rem;
          margin-top: 0.5rem;
          font-size: 0.9rem;
          color: var(--text-tertiary);
        }

        .registration-required {
          color: var(--warning);
        }

        .event-price {
          color: var(--success);
        }

        .community-icon,
        .location-icon {
          color: var(--accent);
        }

        .community-info {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .community-info h4 {
          color: var(--nyc-white);
          margin: 0;
          font-size: 1.1rem;
        }

        .community-type {
          color: var(--terminal-color);
          font-size: 0.9rem;
          margin: 0;
        }

        .community-description {
          color: var(--nyc-white);
          opacity: 0.8;
          font-size: 0.9rem;
          line-height: 1.4;
          margin: 0.5rem 0;
        }

        .community-links {
          display: flex;
          gap: 1rem;
          flex-wrap: wrap;
        }

        .community-link {
          color: var(--terminal-color);
          text-decoration: none;
          font-size: 0.9rem;
          transition: color 0.2s ease;
        }

        .community-link:hover {
          color: var(--nyc-orange);
        }

        .membership-info {
          display: flex;
          gap: 1rem;
          align-items: center;
          margin-top: 0.5rem;
        }

        .membership-type {
          color: var(--terminal-color);
          font-size: 0.9rem;
          padding: 0.25rem 0.5rem;
          border: 1px solid var(--terminal-color);
        }

        .membership-fee {
          color: var(--nyc-white);
          font-size: 0.9rem;
        }

        .amenities {
          margin-top: 1rem;
        }

        .amenities h5 {
          color: var(--terminal-color);
          font-size: 0.8rem;
          margin: 0 0 0.5rem 0;
        }

        .amenity-tags {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
        }

        .amenity-tag {
          font-size: 0.8rem;
          padding: 0.25rem 0.5rem;
          background: rgba(0, 255, 255, 0.1);
          border: 1px solid var(--terminal-color);
          color: var(--terminal-color);
        }

        .location-hours {
          margin-top: 1rem;
        }

        .location-hours h5 {
          color: var(--terminal-color);
          font-size: 0.8rem;
          margin: 0 0 0.5rem 0;
        }

        .hours-grid {
          display: grid;
          gap: 0.25rem;
        }

        .hours-row {
          display: grid;
          grid-template-columns: 100px 1fr;
          gap: 1rem;
          font-size: 0.9rem;
        }

        .day {
          color: var(--terminal-color);
        }

        .hours {
          color: var(--nyc-white);
        }

        .event-metadata-grid {
          display: grid;
          gap: 1rem;
        }

        .metadata-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .metadata-label {
          color: var(--terminal-color);
          font-size: 0.9rem;
        }

        .metadata-value {
          color: var(--nyc-white);
          font-size: 0.9rem;
        }

        .metadata-value.required {
          color: var(--nyc-orange);
        }

        @media (max-width: 1024px) {
          .events-layout {
            grid-template-columns: 1fr;
          }

          .desktop-only {
            display: none !important;
          }

          .items-grid {
            max-height: none;
            overflow: visible;
          }

          .page-header {
            display: none;
          }
        }

        .infinite-scroll-trigger {
          height: 40px;
          min-height: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0;
          padding: 0;
          width: 100%;
          opacity: 0.8;
          background: transparent;
        }

        .loading-indicator {
          display: flex;
          gap: 6px;
          padding: 10px;
          justify-content: center;
        }

        .past-events-toggle {
          width: 100%;
          padding: 0.5rem;
          background: rgba(0, 56, 117, 0.3);
          border: 1px solid var(--terminal-color);
          color: var(--terminal-color);
          font-family: var(--font-mono);
          font-size: 0.8rem;
          cursor: pointer;
          transition: all 0.2s ease;
          text-align: center;
        }
        
        .past-events-toggle.active {
          background: rgba(0, 56, 117, 0.5);
          border-color: var(--nyc-orange);
          color: var(--nyc-orange);
        }
        
        .past-events-toggle:hover {
          background: rgba(0, 56, 117, 0.5);
          border-color: var(--nyc-orange);
          color: var(--nyc-orange);
        }
      `}</style>
    </main>
  );
} 