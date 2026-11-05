package com.example.data

import com.example.model.*

object TerminalMapRepository {

    // JFK Terminal 4 Layout
    private val jfkT4Floor1 = ConcourseFloor(
        level = 1,
        levelName = "Departures & Gates",
        description = "Ticketing, Main Security, Concourse A & Concourse B",
        centralHubCenter = PointF(0.50f, 0.65f),
        securityPosition = PointF(0.50f, 0.76f),
        entrancePosition = PointF(0.50f, 0.90f),
        concourses = listOf(
            // Concourse A extending North-West
            ConcourseSection(
                id = "JFK_CONC_A",
                name = "Concourse A (Gates A2–A7)",
                start = PointF(0.42f, 0.62f),
                end = PointF(0.18f, 0.28f),
                width = 0.055f,
                gatesRange = "A2–A7"
            ),
            // Concourse B extending North-East (Longer pier)
            ConcourseSection(
                id = "JFK_CONC_B1",
                name = "Concourse B (Gates B20–B32)",
                start = PointF(0.58f, 0.62f),
                end = PointF(0.82f, 0.38f),
                width = 0.055f,
                gatesRange = "B20–B32"
            ),
            ConcourseSection(
                id = "JFK_CONC_B2",
                name = "Concourse B Extension (Gates B33–B45)",
                start = PointF(0.82f, 0.38f),
                end = PointF(0.92f, 0.16f),
                width = 0.05f,
                gatesRange = "B33–B45"
            ),
            // Main Central Terminal Hall
            ConcourseSection(
                id = "JFK_CENTRAL_HALL",
                name = "Central Departures Marketplace",
                start = PointF(0.35f, 0.65f),
                end = PointF(0.65f, 0.65f),
                width = 0.12f,
                gatesRange = "Security & Retail Plaza"
            )
        )
    )

    private val jfkT4Floor2 = ConcourseFloor(
        level = 2,
        levelName = "Mezzanine Lounges",
        description = "Airline VIP Lounges, Premium Clubs & Fine Dining",
        centralHubCenter = PointF(0.50f, 0.60f),
        securityPosition = PointF(0.50f, 0.70f),
        entrancePosition = PointF(0.50f, 0.85f),
        concourses = listOf(
            ConcourseSection(
                id = "JFK_MEZZ_A",
                name = "Mezzanine West Lounge Gallery",
                start = PointF(0.40f, 0.58f),
                end = PointF(0.24f, 0.36f),
                width = 0.06f,
                gatesRange = "Centurion & Virgin Clubhouses"
            ),
            ConcourseSection(
                id = "JFK_MEZZ_B",
                name = "Mezzanine East Delta Sky Deck",
                start = PointF(0.60f, 0.58f),
                end = PointF(0.78f, 0.40f),
                width = 0.06f,
                gatesRange = "Sky Club & Emirates Lounge"
            )
        )
    )

    private val jfkT4Floor0 = ConcourseFloor(
        level = 0,
        levelName = "Arrivals & Ground Transit",
        description = "Baggage Claim, Customs, AirTrain & Taxi Stands",
        centralHubCenter = PointF(0.50f, 0.55f),
        securityPosition = PointF(0.50f, 0.62f),
        entrancePosition = PointF(0.50f, 0.82f),
        concourses = listOf(
            ConcourseSection(
                id = "JFK_BAGGAGE_HALL",
                name = "International Baggage Claim",
                start = PointF(0.25f, 0.55f),
                end = PointF(0.75f, 0.55f),
                width = 0.14f,
                gatesRange = "Carousels 1–10"
            ),
            ConcourseSection(
                id = "JFK_AIRTRAIN_LINK",
                name = "AirTrain Walkway & Taxi Stand",
                start = PointF(0.50f, 0.70f),
                end = PointF(0.50f, 0.90f),
                width = 0.08f,
                gatesRange = "AirTrain to Jamaica / Howard Beach"
            )
        )
    )

    private val jfkAmenities = listOf(
        // Security Checkpoints
        TerminalAmenity(
            id = "JFK_SEC_MAIN",
            name = "TSA PreCheck & CLEAR Checkpoint 4",
            category = AmenityCategory.SECURITY,
            airportCode = "JFK",
            terminal = "T4",
            concourse = "Main Hall",
            level = 1,
            locationDescription = "Central Departures, prior to Concourse A/B split",
            position = PointF(0.50f, 0.76f),
            openingHours = "24/7 (PreCheck: 04:30–21:30)",
            waitTimeMinutes = 6,
            walkTimeFromSecurityMinutes = 0,
            walkDistanceMeters = 0,
            features = listOf("TSA PreCheck", "CLEAR Plus", "Biometric Boarding")
        ),
        // Gates Concourse B
        TerminalAmenity(
            id = "JFK_GATE_B22",
            name = "Gate B22",
            category = AmenityCategory.GATE,
            airportCode = "JFK",
            terminal = "T4",
            concourse = "Concourse B",
            level = 1,
            locationDescription = "Concourse B, near Shake Shack",
            position = PointF(0.66f, 0.54f),
            gateNumber = "B22",
            walkTimeFromSecurityMinutes = 4,
            walkDistanceMeters = 240,
            assignedFlightNumber = "AA 100",
            features = listOf("Jet Bridge", "Power Outlets at Seats", "Priority Boarding Lane")
        ),
        TerminalAmenity(
            id = "JFK_GATE_B24",
            name = "Gate B24",
            category = AmenityCategory.GATE,
            airportCode = "JFK",
            terminal = "T4",
            concourse = "Concourse B",
            level = 1,
            locationDescription = "Concourse B midway",
            position = PointF(0.72f, 0.48f),
            gateNumber = "B24",
            walkTimeFromSecurityMinutes = 6,
            walkDistanceMeters = 380,
            assignedFlightNumber = "DL 401",
            features = listOf("Widebody Capable (A350/B777)", "Facial Recognition Gate")
        ),
        TerminalAmenity(
            id = "JFK_GATE_B28",
            name = "Gate B28",
            category = AmenityCategory.GATE,
            airportCode = "JFK",
            terminal = "T4",
            concourse = "Concourse B",
            level = 1,
            locationDescription = "Concourse B Outer Pier",
            position = PointF(0.79f, 0.40f),
            gateNumber = "B28",
            walkTimeFromSecurityMinutes = 8,
            walkDistanceMeters = 520,
            assignedFlightNumber = "BA 178",
            features = listOf("Dual Jet Bridge", "Accessible Boarding Ramp")
        ),
        TerminalAmenity(
            id = "JFK_GATE_B36",
            name = "Gate B36",
            category = AmenityCategory.GATE,
            airportCode = "JFK",
            terminal = "T4",
            concourse = "Concourse B Extension",
            level = 1,
            locationDescription = "Far end of Concourse B extension",
            position = PointF(0.88f, 0.22f),
            gateNumber = "B36",
            walkTimeFromSecurityMinutes = 11,
            walkDistanceMeters = 720,
            assignedFlightNumber = "EK 202",
            features = listOf("A380 Double Decker Gate", "Moving Walkway Connected")
        ),
        // Gates Concourse A
        TerminalAmenity(
            id = "JFK_GATE_A3",
            name = "Gate A3",
            category = AmenityCategory.GATE,
            airportCode = "JFK",
            terminal = "T4",
            concourse = "Concourse A",
            level = 1,
            locationDescription = "Concourse A West Wing",
            position = PointF(0.34f, 0.50f),
            gateNumber = "A3",
            walkTimeFromSecurityMinutes = 4,
            walkDistanceMeters = 260,
            assignedFlightNumber = "VS 4",
            features = listOf("Jet Bridge", "Quiet Seating Area")
        ),
        TerminalAmenity(
            id = "JFK_GATE_A5",
            name = "Gate A5",
            category = AmenityCategory.GATE,
            airportCode = "JFK",
            terminal = "T4",
            concourse = "Concourse A",
            level = 1,
            locationDescription = "Concourse A Outer Pier",
            position = PointF(0.24f, 0.35f),
            gateNumber = "A5",
            walkTimeFromSecurityMinutes = 7,
            walkDistanceMeters = 440,
            assignedFlightNumber = "AF 022",
            features = listOf("International Departures", "Air-conditioned Bridge")
        ),
        // Lounges
        TerminalAmenity(
            id = "JFK_LOUNGE_CENTURION",
            name = "The Centurion Lounge (American Express)",
            category = AmenityCategory.LOUNGE,
            airportCode = "JFK",
            terminal = "T4",
            concourse = "Main Marketplace",
            level = 2,
            locationDescription = "Post-security, Mezzanine Level beyond Checkpoint 4",
            position = PointF(0.44f, 0.58f),
            openingHours = "05:00 – 22:00",
            accessInfo = "Amex Centurion, Platinum & Delta Reserve Cardmembers",
            walkTimeFromSecurityMinutes = 2,
            walkDistanceMeters = 120,
            rating = 4.8f,
            features = listOf("Signature Speakeasy '1850'", "Chef Ignacio Mattos Menu", "Equinox Body Lab", "Private Shower Suites")
        ),
        TerminalAmenity(
            id = "JFK_LOUNGE_SKYCLUB",
            name = "Delta Sky Club & Sky Deck",
            category = AmenityCategory.LOUNGE,
            airportCode = "JFK",
            terminal = "T4",
            concourse = "Concourse B",
            level = 2,
            locationDescription = "Gate B31 Mezzanine, Concourse B",
            position = PointF(0.72f, 0.38f),
            openingHours = "05:00 – 23:30",
            accessInfo = "Delta One, SkyTeam Elite Plus, Delta Reserve",
            walkTimeFromSecurityMinutes = 6,
            walkDistanceMeters = 400,
            rating = 4.7f,
            features = listOf("Open-Air Sky Deck Runway View", "Full Buffet & Cocktail Bar", "6 Luxury Showers", "Soundproof Phone Pods")
        ),
        TerminalAmenity(
            id = "JFK_LOUNGE_VIRGIN",
            name = "Virgin Atlantic Clubhouse",
            category = AmenityCategory.LOUNGE,
            airportCode = "JFK",
            terminal = "T4",
            concourse = "Concourse A",
            level = 2,
            locationDescription = "Above Gate A5, Concourse A",
            position = PointF(0.26f, 0.38f),
            openingHours = "05:00 – 08:30 & 14:00 – 23:30",
            accessInfo = "Upper Class Passengers & Flying Club Gold",
            walkTimeFromSecurityMinutes = 7,
            walkDistanceMeters = 430,
            rating = 4.9f,
            features = listOf("Bespoke Cocktail Bar", "A la carte Dining", "Pool Table", "Bumble and bumble Salon")
        ),
        TerminalAmenity(
            id = "JFK_LOUNGE_EMIRATES",
            name = "Emirates First & Business Lounge",
            category = AmenityCategory.LOUNGE,
            airportCode = "JFK",
            terminal = "T4",
            concourse = "Concourse A",
            level = 2,
            locationDescription = "Near Gate A4, Water Oasis Section",
            position = PointF(0.32f, 0.44f),
            openingHours = "16:00 – 22:30",
            accessInfo = "Emirates First/Business & Skywards Gold/Platinum",
            walkTimeFromSecurityMinutes = 5,
            walkDistanceMeters = 310,
            rating = 4.8f,
            features = listOf("Gourmet International Buffet", "Direct Jet Bridge Boarding", "Quiet Relaxation Sanctuary")
        ),
        // Dining & Coffee
        TerminalAmenity(
            id = "JFK_FOOD_SHAKESHACK",
            name = "Shake Shack",
            category = AmenityCategory.DINING,
            airportCode = "JFK",
            terminal = "T4",
            concourse = "Concourse B",
            level = 1,
            locationDescription = "Concourse B, Gate B23",
            position = PointF(0.68f, 0.52f),
            openingHours = "06:00 – 23:00",
            walkTimeFromSecurityMinutes = 5,
            walkDistanceMeters = 280,
            rating = 4.6f,
            features = listOf("ShackBurger", "Crinkle-cut Fries", "Mobile Order Ahead", "Beer & Wine")
        ),
        TerminalAmenity(
            id = "JFK_FOOD_STARBUCKS",
            name = "Starbucks Reserve Cafe",
            category = AmenityCategory.DINING,
            airportCode = "JFK",
            terminal = "T4",
            concourse = "Main Hall",
            level = 1,
            locationDescription = "Central Marketplace, opposite Duty Free",
            position = PointF(0.53f, 0.63f),
            openingHours = "24 Hours",
            walkTimeFromSecurityMinutes = 2,
            walkDistanceMeters = 110,
            rating = 4.5f,
            features = listOf("Nitro Cold Brew", "Fresh Bakery", "Express Pick-up Counter")
        ),
        TerminalAmenity(
            id = "JFK_FOOD_UPTOWN",
            name = "Uptown Brasserie by Marcus Samuelsson",
            category = AmenityCategory.DINING,
            airportCode = "JFK",
            terminal = "T4",
            concourse = "Concourse B",
            level = 1,
            locationDescription = "Concourse B, Gate B32",
            position = PointF(0.77f, 0.42f),
            openingHours = "06:30 – 22:00",
            walkTimeFromSecurityMinutes = 7,
            walkDistanceMeters = 460,
            rating = 4.4f,
            features = listOf("Sit-down Dining", "Handcrafted Cocktails", "Smoked Salmon Benedict")
        ),
        // Shopping
        TerminalAmenity(
            id = "JFK_SHOP_DFS",
            name = "DFS Duty Free Galleria",
            category = AmenityCategory.SHOPPING,
            airportCode = "JFK",
            terminal = "T4",
            concourse = "Main Hall",
            level = 1,
            locationDescription = "Immediately after security exit",
            position = PointF(0.48f, 0.67f),
            openingHours = "24 Hours",
            walkTimeFromSecurityMinutes = 1,
            walkDistanceMeters = 70,
            features = listOf("Perfume & Cosmetics", "Fine Spirits", "Designer Sunglasses", "Tax-Free Savings")
        ),
        TerminalAmenity(
            id = "JFK_SHOP_TUMI",
            name = "TUMI Travel Luggage & Tech",
            category = AmenityCategory.SHOPPING,
            airportCode = "JFK",
            terminal = "T4",
            concourse = "Concourse B",
            level = 1,
            locationDescription = "Concourse B entrance",
            position = PointF(0.61f, 0.59f),
            openingHours = "07:00 – 21:30",
            walkTimeFromSecurityMinutes = 3,
            walkDistanceMeters = 190,
            features = listOf("Luggage Monogramming", "Universal Travel Adapters", "Backpacks")
        ),
        // Restrooms
        TerminalAmenity(
            id = "JFK_RESTROOM_CENTRAL",
            name = "Restrooms & All-Gender Family Suite",
            category = AmenityCategory.RESTROOM,
            airportCode = "JFK",
            terminal = "T4",
            concourse = "Main Hall",
            level = 1,
            locationDescription = "Behind Starbucks, Central Hall",
            position = PointF(0.44f, 0.67f),
            openingHours = "24 Hours",
            walkTimeFromSecurityMinutes = 1,
            walkDistanceMeters = 80,
            features = listOf("Wheelchair Accessible", "Baby Changing Station", "Pet Relief Room Nearby")
        ),
        TerminalAmenity(
            id = "JFK_RESTROOM_B",
            name = "Restrooms & Water Refill Station",
            category = AmenityCategory.RESTROOM,
            airportCode = "JFK",
            terminal = "T4",
            concourse = "Concourse B",
            level = 1,
            locationDescription = "Concourse B near Gate B25",
            position = PointF(0.74f, 0.46f),
            openingHours = "24 Hours",
            walkTimeFromSecurityMinutes = 6,
            walkDistanceMeters = 390,
            features = listOf("Touchless Faucets", "Filtered Hydration Station")
        ),
        // Transit & Baggage (Level 0)
        TerminalAmenity(
            id = "JFK_TRANSIT_AIRTRAIN",
            name = "AirTrain JFK Station",
            category = AmenityCategory.TRANSIT,
            airportCode = "JFK",
            terminal = "T4",
            concourse = "Ground Hub",
            level = 0,
            locationDescription = "Skybridge connection, follow green signs",
            position = PointF(0.50f, 0.88f),
            openingHours = "24/7 (Every 4–8 mins)",
            walkTimeFromSecurityMinutes = 4,
            walkDistanceMeters = 260,
            features = listOf("OMNY Tap & Go", "Direct to Jamaica LIRR / Subway", "Terminal Connection Free")
        ),
        TerminalAmenity(
            id = "JFK_BAGGAGE_CLAIM",
            name = "Baggage Claim Carousels 4–8",
            category = AmenityCategory.TRANSIT,
            airportCode = "JFK",
            terminal = "T4",
            concourse = "Arrivals Hall",
            level = 0,
            locationDescription = "Level 0 Arrivals Hall",
            position = PointF(0.48f, 0.55f),
            openingHours = "24 Hours",
            walkTimeFromSecurityMinutes = 3,
            walkDistanceMeters = 180,
            features = listOf("Oversize Baggage Desk", "Luggage Carts ($6)", "Lost & Found Assistance")
        )
    )

    // LHR Terminal 5 Layout
    private val lhrT5Floor1 = ConcourseFloor(
        level = 1,
        levelName = "Departures & Concourse A",
        description = "Check-in Zone, North & South Security, Flight Connections",
        centralHubCenter = PointF(0.50f, 0.50f),
        securityPosition = PointF(0.50f, 0.74f),
        entrancePosition = PointF(0.50f, 0.90f),
        concourses = listOf(
            ConcourseSection(
                id = "LHR_MAIN_A_NORTH",
                name = "Concourse A North (Gates A1–A11)",
                start = PointF(0.35f, 0.48f),
                end = PointF(0.20f, 0.22f),
                width = 0.065f,
                gatesRange = "A1–A11"
            ),
            ConcourseSection(
                id = "LHR_MAIN_A_SOUTH",
                name = "Concourse A South (Gates A12–A23)",
                start = PointF(0.65f, 0.48f),
                end = PointF(0.80f, 0.22f),
                width = 0.065f,
                gatesRange = "A12–A23"
            ),
            ConcourseSection(
                id = "LHR_CENTRAL_ATRIUM",
                name = "Grand Atrium & Luxury Galleria",
                start = PointF(0.30f, 0.52f),
                end = PointF(0.70f, 0.52f),
                width = 0.13f,
                gatesRange = "Airside Galleria"
            )
        )
    )

    private val lhrAmenities = listOf(
        TerminalAmenity(
            id = "LHR_SEC_SOUTH",
            name = "South Security & First Wing",
            category = AmenityCategory.SECURITY,
            airportCode = "LHR",
            terminal = "T5",
            concourse = "Main Hall",
            level = 1,
            locationDescription = "Departures South side, direct entrance to Galleries Club",
            position = PointF(0.58f, 0.74f),
            openingHours = "05:00 – 22:30",
            waitTimeMinutes = 5,
            walkTimeFromSecurityMinutes = 0,
            walkDistanceMeters = 0,
            features = listOf("Fast Track Security", "BA First Wing Private Check-in", "Smart CT Baggage Scanners")
        ),
        TerminalAmenity(
            id = "LHR_GATE_A10",
            name = "Gate A10",
            category = AmenityCategory.GATE,
            airportCode = "LHR",
            terminal = "T5",
            concourse = "Concourse A",
            level = 1,
            locationDescription = "North pier, near Pret",
            position = PointF(0.25f, 0.28f),
            gateNumber = "A10",
            walkTimeFromSecurityMinutes = 5,
            walkDistanceMeters = 340,
            assignedFlightNumber = "BA 117",
            features = listOf("Biometric Smart Gate", "Priority Boarding Groups 1–9")
        ),
        TerminalAmenity(
            id = "LHR_GATE_A18",
            name = "Gate A18",
            category = AmenityCategory.GATE,
            airportCode = "LHR",
            terminal = "T5",
            concourse = "Concourse A",
            level = 1,
            locationDescription = "South pier, near Harrods",
            position = PointF(0.75f, 0.28f),
            gateNumber = "A18",
            walkTimeFromSecurityMinutes = 4,
            walkDistanceMeters = 290,
            assignedFlightNumber = "VS 103",
            features = listOf("Widebody Boarding", "Window views of Runway 09R")
        ),
        TerminalAmenity(
            id = "LHR_LOUNGE_CONCORDE",
            name = "The Concorde Room (British Airways)",
            category = AmenityCategory.LOUNGE,
            airportCode = "LHR",
            terminal = "T5",
            concourse = "South Galleria",
            level = 1,
            locationDescription = "Post South Security, turn right into First Wing",
            position = PointF(0.68f, 0.65f),
            openingHours = "05:00 – 22:30",
            accessInfo = "British Airways First Class & Concorde Room Cardholders",
            walkTimeFromSecurityMinutes = 1,
            walkDistanceMeters = 90,
            rating = 4.9f,
            features = listOf("Private Cabana Booths", "Concorde Dining Terrace", "Laurent-Perrier Grand Siecle", "Full Valet")
        ),
        TerminalAmenity(
            id = "LHR_LOUNGE_GALLERIES",
            name = "BA Galleries Club Lounge South",
            category = AmenityCategory.LOUNGE,
            airportCode = "LHR",
            terminal = "T5",
            concourse = "South Galleria",
            level = 1,
            locationDescription = "Level 3 Mezzanine above Gate A16",
            position = PointF(0.64f, 0.44f),
            openingHours = "05:00 – 22:30",
            accessInfo = "Club World, Club Europe, Silver / Gold Executive Club",
            walkTimeFromSecurityMinutes = 3,
            walkDistanceMeters = 200,
            rating = 4.6f,
            features = listOf("Silver Bar", "Quiet Workstations", "Hot Food Buffet", "Showers")
        ),
        TerminalAmenity(
            id = "LHR_FOOD_RAMSAY",
            name = "Gordon Ramsay Plane Food",
            category = AmenityCategory.DINING,
            airportCode = "LHR",
            terminal = "T5",
            concourse = "Airside Galleria",
            level = 1,
            locationDescription = "Top of South escalators",
            position = PointF(0.55f, 0.46f),
            openingHours = "05:30 – 21:30",
            walkTimeFromSecurityMinutes = 3,
            walkDistanceMeters = 180,
            rating = 4.5f,
            features = listOf("Plane Food Grab & Go Picnics", "Beef Wellington Bites", "Runway Vista Tables")
        ),
        TerminalAmenity(
            id = "LHR_SHOP_HARRODS",
            name = "Harrods Signature Boutique",
            category = AmenityCategory.SHOPPING,
            airportCode = "LHR",
            terminal = "T5",
            concourse = "Central Galleria",
            level = 1,
            locationDescription = "Central retail square",
            position = PointF(0.46f, 0.50f),
            openingHours = "06:00 – 21:00",
            walkTimeFromSecurityMinutes = 2,
            walkDistanceMeters = 130,
            features = listOf("Harrods Tea & Hampers", "Designer Fashion", "Tax-Free Shopping")
        )
    )

    // SFO International Terminal Layout
    private val sfoTIntFloor1 = ConcourseFloor(
        level = 1,
        levelName = "Departures Level",
        description = "Main Hall, Boarding Area A (West) & Boarding Area G (East)",
        centralHubCenter = PointF(0.50f, 0.60f),
        securityPosition = PointF(0.50f, 0.72f),
        entrancePosition = PointF(0.50f, 0.88f),
        concourses = listOf(
            ConcourseSection(
                id = "SFO_BOARDING_A",
                name = "Boarding Area A (Gates A1–A15)",
                start = PointF(0.40f, 0.55f),
                end = PointF(0.15f, 0.25f),
                width = 0.06f,
                gatesRange = "A1–A15"
            ),
            ConcourseSection(
                id = "SFO_BOARDING_G",
                name = "Boarding Area G (Gates G91–G102)",
                start = PointF(0.60f, 0.55f),
                end = PointF(0.85f, 0.25f),
                width = 0.06f,
                gatesRange = "G91–G102"
            ),
            ConcourseSection(
                id = "SFO_MAIN_HALL",
                name = "International Ticketing & Security Hall",
                start = PointF(0.30f, 0.62f),
                end = PointF(0.70f, 0.62f),
                width = 0.12f,
                gatesRange = "Central Marketplace"
            )
        )
    )

    private val sfoAmenities = listOf(
        TerminalAmenity(
            id = "SFO_SEC_G",
            name = "Security Checkpoint G (Star Alliance)",
            category = AmenityCategory.SECURITY,
            airportCode = "SFO",
            terminal = "Intl",
            concourse = "Boarding Area G",
            level = 1,
            locationDescription = "East side of Main Hall, leads to United Polaris & Gates G",
            position = PointF(0.62f, 0.68f),
            openingHours = "04:30 – 00:30",
            waitTimeMinutes = 4,
            walkTimeFromSecurityMinutes = 0,
            walkDistanceMeters = 0,
            features = listOf("TSA PreCheck", "CLEAR Plus", "Priority Lane")
        ),
        TerminalAmenity(
            id = "SFO_GATE_G96",
            name = "Gate G96",
            category = AmenityCategory.GATE,
            airportCode = "SFO",
            terminal = "Intl",
            concourse = "Boarding Area G",
            level = 1,
            locationDescription = "Boarding Area G midway",
            position = PointF(0.75f, 0.38f),
            gateNumber = "G96",
            walkTimeFromSecurityMinutes = 5,
            walkDistanceMeters = 320,
            assignedFlightNumber = "UA 890",
            features = listOf("Widebody Bridge (Boeing 777/787)", "Automated Passport Control Gate")
        ),
        TerminalAmenity(
            id = "SFO_GATE_A8",
            name = "Gate A8",
            category = AmenityCategory.GATE,
            airportCode = "SFO",
            terminal = "Intl",
            concourse = "Boarding Area A",
            level = 1,
            locationDescription = "Boarding Area A outer concourse",
            position = PointF(0.24f, 0.34f),
            gateNumber = "A8",
            walkTimeFromSecurityMinutes = 6,
            walkDistanceMeters = 400,
            assignedFlightNumber = "AF 084",
            features = listOf("Jet Bridge", "Quiet Boarding Bay")
        ),
        TerminalAmenity(
            id = "SFO_LOUNGE_POLARIS",
            name = "United Polaris Lounge",
            category = AmenityCategory.LOUNGE,
            airportCode = "SFO",
            terminal = "Intl",
            concourse = "Boarding Area G",
            level = 1,
            locationDescription = "Past Security G, to the right",
            position = PointF(0.66f, 0.52f),
            openingHours = "06:30 – 22:30",
            accessInfo = "Long-haul United Polaris Business & Star Alliance First/Business",
            walkTimeFromSecurityMinutes = 2,
            walkDistanceMeters = 140,
            rating = 4.9f,
            features = listOf("The Dining Room (Sit-down table service)", "Saks Fifth Avenue Daybeds", "Luxurious Showers")
        ),
        TerminalAmenity(
            id = "SFO_FOOD_NAPA",
            name = "Napa Farms Market",
            category = AmenityCategory.DINING,
            airportCode = "SFO",
            terminal = "Intl",
            concourse = "Main Marketplace",
            level = 1,
            locationDescription = "Central connector near Security G",
            position = PointF(0.54f, 0.58f),
            openingHours = "06:00 – 23:00",
            walkTimeFromSecurityMinutes = 2,
            walkDistanceMeters = 110,
            rating = 4.7f,
            features = listOf("Artisan Cheeses", "Acme Bread Sandwiches", "Cowgirl Creamery", "Espresso Bar")
        )
    )

    // DXB Terminal 3 Layout
    private val dxbT3Floor1 = ConcourseFloor(
        level = 1,
        levelName = "Departures & Gates",
        description = "World's Largest Airport Terminal, Concourse A, B & C",
        centralHubCenter = PointF(0.50f, 0.50f),
        securityPosition = PointF(0.50f, 0.70f),
        entrancePosition = PointF(0.50f, 0.85f),
        concourses = listOf(
            ConcourseSection(
                id = "DXB_CONC_B",
                name = "Concourse B (Gates B1–B32)",
                start = PointF(0.20f, 0.50f),
                end = PointF(0.80f, 0.50f),
                width = 0.08f,
                gatesRange = "B1–B32"
            ),
            ConcourseSection(
                id = "DXB_CONC_A_PIER",
                name = "Concourse A (Dedicated A380 Pier)",
                start = PointF(0.50f, 0.38f),
                end = PointF(0.50f, 0.15f),
                width = 0.07f,
                gatesRange = "A1–A24 (All A380)"
            )
        )
    )

    private val dxbAmenities = listOf(
        TerminalAmenity(
            id = "DXB_GATE_B14",
            name = "Gate B14",
            category = AmenityCategory.GATE,
            airportCode = "DXB",
            terminal = "T3",
            concourse = "Concourse B",
            level = 1,
            locationDescription = "Concourse B Center",
            position = PointF(0.42f, 0.50f),
            gateNumber = "B14",
            walkTimeFromSecurityMinutes = 4,
            walkDistanceMeters = 270,
            assignedFlightNumber = "EK 201",
            features = listOf("Direct Lounge Boarding", "Biometric Smart Tunnel")
        ),
        TerminalAmenity(
            id = "DXB_LOUNGE_EMIRATES_FIRST",
            name = "Emirates First Class Lounge",
            category = AmenityCategory.LOUNGE,
            airportCode = "DXB",
            terminal = "T3",
            concourse = "Concourse B",
            level = 1,
            locationDescription = "Spans entire upper concourse level",
            position = PointF(0.50f, 0.42f),
            openingHours = "24/7",
            accessInfo = "Emirates First Class & Skywards Platinum",
            walkTimeFromSecurityMinutes = 3,
            walkDistanceMeters = 190,
            rating = 5.0f,
            features = listOf("Timeless Spa Treatments", "Fine Wine Cellar & Sommelier", "Quiet Sleeping Rooms", "Direct Gate Boarding")
        ),
        TerminalAmenity(
            id = "DXB_SHOP_DUTYFREE",
            name = "Dubai Duty Free Mega Pavilion",
            category = AmenityCategory.SHOPPING,
            airportCode = "DXB",
            terminal = "T3",
            concourse = "Concourse B",
            level = 1,
            locationDescription = "Central Hub between Concourse A & B",
            position = PointF(0.50f, 0.56f),
            openingHours = "24/7",
            walkTimeFromSecurityMinutes = 2,
            walkDistanceMeters = 120,
            features = listOf("Gold & Jewelry", "Luxury Electronics", "Finest Dates & Confectionery", "Millennium Millionaire Raffle")
        )
    )

    // Master layouts catalog
    val layouts: Map<String, AirportTerminalLayout> = mapOf(
        "JFK" to AirportTerminalLayout(
            airportCode = "JFK",
            airportName = "John F. Kennedy International",
            city = "New York",
            terminalId = "T4",
            terminalName = "Terminal 4 (International / Delta Hub)",
            availableLevels = listOf(1, 2, 0),
            floors = mapOf(
                1 to jfkT4Floor1,
                2 to jfkT4Floor2,
                0 to jfkT4Floor0
            ),
            amenities = jfkAmenities
        ),
        "LHR" to AirportTerminalLayout(
            airportCode = "LHR",
            airportName = "London Heathrow Airport",
            city = "London",
            terminalId = "T5",
            terminalName = "Terminal 5 (British Airways Flagship)",
            availableLevels = listOf(1),
            floors = mapOf(
                1 to lhrT5Floor1
            ),
            amenities = lhrAmenities
        ),
        "SFO" to AirportTerminalLayout(
            airportCode = "SFO",
            airportName = "San Francisco International",
            city = "San Francisco",
            terminalId = "Intl",
            terminalName = "International Terminal (Areas A & G)",
            availableLevels = listOf(1),
            floors = mapOf(
                1 to sfoTIntFloor1
            ),
            amenities = sfoAmenities
        ),
        "DXB" to AirportTerminalLayout(
            airportCode = "DXB",
            airportName = "Dubai International Airport",
            city = "Dubai",
            terminalId = "T3",
            terminalName = "Terminal 3 (Emirates Megahub)",
            availableLevels = listOf(1),
            floors = mapOf(
                1 to dxbT3Floor1
            ),
            amenities = dxbAmenities
        )
    )

    fun getLayout(airportCode: String): AirportTerminalLayout {
        return layouts[airportCode.uppercase()] ?: layouts["JFK"]!!
    }

    fun getAllSupportedAirports(): List<Pair<String, String>> {
        return layouts.values.map { it.airportCode to "${it.airportCode} - ${it.city}" }
    }

    fun findAmenityByGate(airportCode: String, gateNumber: String): TerminalAmenity? {
        val layout = layouts[airportCode.uppercase()] ?: return null
        val cleanGate = gateNumber.trim().replace("Gate ", "", ignoreCase = true).trim()
        return layout.amenities.find {
            it.gateNumber?.equals(cleanGate, ignoreCase = true) == true ||
            it.name.contains(cleanGate, ignoreCase = true)
        }
    }
}
