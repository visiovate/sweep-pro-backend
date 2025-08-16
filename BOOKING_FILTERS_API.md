# Booking Filters API Documentation

This document describes the updated booking API endpoints that support filtering by status for the frontend.

## Overview

The booking system now supports filtering bookings by status to provide a better user experience in the frontend. Users can filter their bookings into categories like "scheduled", "completed", and "cancelled".

## Available Filters

- **All Bookings** - Shows all bookings regardless of status
- **Scheduled** - Shows bookings with status: CONFIRMED, ASSIGNED, or IN_PROGRESS
- **Completed** - Shows bookings with status: COMPLETED
- **Cancelled** - Shows bookings with status: CANCELLED

## API Endpoints

### 1. Get User Bookings with Filtering

**Endpoint:** `GET /api/bookings/my-bookings`

**Query Parameters:**
- `status` (optional): Filter by status category
  - `all` - All bookings (default)
  - `scheduled` - Confirmed, assigned, or in-progress bookings
  - `completed` - Completed bookings
  - `cancelled` - Cancelled bookings

**Example Requests:**
```bash
# Get all bookings
GET /api/bookings/my-bookings

# Get scheduled bookings only
GET /api/bookings/my-bookings?status=scheduled

# Get completed bookings only
GET /api/bookings/my-bookings?status=completed

# Get cancelled bookings only
GET /api/bookings/my-bookings?status=cancelled
```

**Response Format:**
```json
{
  "success": true,
  "data": [
    {
      "id": "booking-id",
      "status": "CONFIRMED",
      "scheduledAt": "2024-12-25T10:00:00.000Z",
      "service": { ... },
      "maid": { ... }
    }
  ],
  "filters": {
    "applied": "scheduled",
    "available": ["all", "scheduled", "completed", "cancelled"]
  }
}
```

### 2. Get Maid Bookings with Filtering

**Endpoint:** `GET /api/bookings/my-assignments`

**Query Parameters:**
- Same as user bookings endpoint

**Usage:** Maids can filter their assigned bookings using the same status parameters.

### 3. Get All Bookings (Admin) with Filtering

**Endpoint:** `GET /api/bookings`

**Query Parameters:**
- `status` (optional): Same filter options as above
- `page` (optional): Page number for pagination (default: 1)
- `limit` (optional): Number of bookings per page (default: 20)

**Response Format:**
```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "currentPage": 1,
    "totalPages": 5,
    "totalBookings": 100,
    "hasNext": true,
    "hasPrev": false
  },
  "filters": {
    "applied": "scheduled",
    "available": ["all", "scheduled", "completed", "cancelled"]
  }
}
```

### 4. Get Booking Statistics

**Endpoint:** `GET /api/bookings/stats`

**Description:** Returns counts for each booking category, useful for displaying filter counts in the frontend.

**Response Format:**
```json
{
  "success": true,
  "data": {
    "total": 25,
    "scheduled": 8,
    "completed": 15,
    "cancelled": 2
  },
  "filters": ["all", "scheduled", "completed", "cancelled"]
}
```

## Frontend Integration

### Filter Component Example

```javascript
const [selectedFilter, setSelectedFilter] = useState('all');
const [bookings, setBookings] = useState([]);
const [stats, setStats] = useState({});

// Fetch bookings based on filter
const fetchBookings = async (filter) => {
  const response = await fetch(`/api/bookings/my-bookings?status=${filter}`);
  const data = await response.json();
  setBookings(data.data);
};

// Fetch statistics
const fetchStats = async () => {
  const response = await fetch('/api/bookings/stats');
  const data = await response.json();
  setStats(data.data);
};

// Filter options
const filterOptions = [
  { value: 'all', label: 'All Bookings', count: stats.total },
  { value: 'scheduled', label: 'Scheduled', count: stats.scheduled },
  { value: 'completed', label: 'Completed', count: stats.completed },
  { value: 'cancelled', label: 'Cancelled', count: stats.cancelled }
];
```

### Filter Button Example

```jsx
{filterOptions.map(option => (
  <button
    key={option.value}
    onClick={() => {
      setSelectedFilter(option.value);
      fetchBookings(option.value);
    }}
    className={selectedFilter === option.value ? 'active' : ''}
  >
    {option.label} ({option.count})
  </button>
))}
```

## Status Mapping

| Frontend Filter | Database Statuses |
|----------------|-------------------|
| All Bookings   | All statuses     |
| Scheduled      | CONFIRMED, ASSIGNED, IN_PROGRESS |
| Completed      | COMPLETED        |
| Cancelled      | CANCELLED        |

## Notes

- All endpoints return bookings ordered by `scheduledAt` in descending order (most recent first)
- The `scheduled` filter includes multiple statuses to show all active/upcoming bookings
- Pagination is available for admin endpoints to handle large numbers of bookings
- Statistics endpoint provides real-time counts for each filter category
- All responses include filter metadata for frontend state management
