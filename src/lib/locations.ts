// India location autocomplete list. Shared by search and settings pages
// so adding a city in one place picks it up everywhere.
// Order: broad → states → UTs → regions → tier-1 metros → NCR → tier-2 cities → tier-3.
// Both common spellings of each city are kept (Bengaluru/Bangalore, Mumbai/Bombay,
// Hubli/Hubballi, etc.) so the autocomplete catches whatever the user types.

export const INDIA_LOCATIONS: string[] = [
    // Broadest options
    'India', 'Pan India', 'Anywhere in India',
    'Remote', 'Work From Home', 'Hybrid',

    // States (28)
    'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
    'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand',
    'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
    'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
    'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
    'Uttar Pradesh', 'Uttarakhand', 'West Bengal',

    // Union Territories
    'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli',
    'Daman and Diu', 'Delhi', 'Jammu and Kashmir', 'Ladakh',
    'Lakshadweep', 'Puducherry',

    // Regions / clusters
    'Delhi NCR', 'NCR', 'Tri-City', 'Northeast India',
    'South India', 'North India', 'West India', 'East India',

    // Tier-1 metros
    'Bengaluru', 'Bangalore', 'Mumbai', 'Bombay', 'New Delhi',
    'Hyderabad', 'Secunderabad', 'Chennai', 'Madras',
    'Pune', 'Poona', 'Kolkata', 'Calcutta', 'Ahmedabad',

    // NCR cluster
    'Noida', 'Greater Noida', 'Gurugram', 'Gurgaon',
    'Faridabad', 'Ghaziabad',

    // Tier-2 cities — sorted roughly by population
    'Jaipur', 'Coimbatore', 'Nagpur', 'Indore', 'Bhopal', 'Lucknow',
    'Kochi', 'Cochin', 'Thiruvananthapuram', 'Trivandrum',
    'Visakhapatnam', 'Vizag', 'Vijayawada', 'Vadodara', 'Baroda', 'Surat',
    'Mysuru', 'Mysore', 'Nashik', 'Patna', 'Bhubaneswar', 'Cuttack',
    'Dehradun', 'Mohali', 'Panchkula', 'Navi Mumbai', 'Thane',
    'Mangalore', 'Mangaluru', 'Hubli', 'Hubballi',
    'Tiruchirappalli', 'Trichy', 'Madurai', 'Salem', 'Vellore',
    'Warangal', 'Rajkot', 'Jodhpur', 'Udaipur',
    'Agra', 'Varanasi', 'Kanpur', 'Allahabad', 'Prayagraj', 'Meerut',
    'Aurangabad', 'Sambhajinagar', 'Solapur', 'Kolhapur',
    'Ranchi', 'Jamshedpur', 'Dhanbad', 'Bokaro',
    'Raipur', 'Bilaspur', 'Korba',
    'Guwahati', 'Shimla', 'Manali', 'Mussoorie',
    'Jammu', 'Srinagar',
    'Amritsar', 'Ludhiana', 'Jalandhar', 'Patiala',

    // Andhra Pradesh / Telangana
    'Guntur', 'Nellore', 'Tirupati', 'Kakinada', 'Rajahmundry',
    'Karimnagar', 'Nizamabad', 'Khammam',

    // Tamil Nadu
    'Tiruppur', 'Erode', 'Hosur', 'Tirunelveli', 'Thoothukudi', 'Tuticorin',
    'Pondicherry', 'Puducherry', 'Cuddalore',

    // Karnataka
    'Belagavi', 'Belgaum', 'Davanagere', 'Tumakuru', 'Tumkur',
    'Shivamogga', 'Shimoga', 'Hassan', 'Udupi',

    // Maharashtra
    'Amravati', 'Sangli', 'Akola', 'Latur', 'Nanded', 'Jalgaon',

    // Uttar Pradesh
    'Aligarh', 'Bareilly', 'Moradabad', 'Saharanpur', 'Gorakhpur',
    'Jhansi', 'Mathura', 'Ayodhya',

    // Madhya Pradesh
    'Gwalior', 'Jabalpur', 'Ujjain', 'Sagar', 'Satna',

    // West Bengal
    'Howrah', 'Siliguri', 'Asansol', 'Durgapur', 'Darjeeling',

    // Kerala
    'Kozhikode', 'Calicut', 'Thrissur', 'Palakkad', 'Kollam',
    'Quilon', 'Alappuzha', 'Kannur', 'Kottayam',

    // Northeast India
    'Imphal', 'Aizawl', 'Itanagar', 'Kohima', 'Shillong',
    'Agartala', 'Gangtok', 'Dimapur',

    // Goa / coastal
    'Panaji', 'Margao', 'Vasco da Gama',

    // Gujarat extras
    'Bhavnagar', 'Jamnagar', 'Junagadh', 'Anand', 'Gandhinagar',

    // Rajasthan extras
    'Kota', 'Bikaner', 'Ajmer',

    // Misc
    'Port Blair', 'Daman', 'Diu', 'Silvassa',
]
