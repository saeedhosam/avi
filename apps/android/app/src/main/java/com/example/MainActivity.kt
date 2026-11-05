package com.example

import android.Manifest
import android.content.Intent
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.data.preferences.ThemeMode
import com.example.model.Flight
import com.example.notifications.FlightNotificationManager
import com.example.ui.screens.*
import com.example.ui.theme.*
import com.example.ui.viewmodel.FlightViewModel

class MainActivity : ComponentActivity() {

    private var initialFlightNumber: String? = null
    private var initialOpenNotifications: Boolean = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // STEP 1: Configure App Check with launch intent before any UI, ViewModels, or Firebase operations
        configureAppCheck(this, intent)

        enableEdgeToEdge()

        // Initialize Notification Channels
        FlightNotificationManager.createNotificationChannel(this)

        handleIntent(intent)

        setContent {
            val viewModel: FlightViewModel = viewModel()
            val themeMode by viewModel.themeMode.collectAsStateWithLifecycle()
            val isSystemDark = isSystemInDarkTheme()
            val isDarkTheme = when (themeMode) {
                ThemeMode.SYSTEM -> isSystemDark
                ThemeMode.LIGHT -> false
                ThemeMode.DARK -> true
            }

            SkyTrackTheme(darkTheme = isDarkTheme) {
                SkyTrackApp(
                    viewModel = viewModel,
                    initialFlightNumber = initialFlightNumber,
                    initialOpenNotifications = initialOpenNotifications,
                    themeMode = themeMode,
                    onThemeModeChange = { viewModel.setThemeMode(it) }
                )
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIntent(intent)
    }

    private fun handleIntent(intent: Intent?) {
        initialFlightNumber = intent?.getStringExtra("EXTRA_FLIGHT_NUMBER")
        initialOpenNotifications = intent?.getBooleanExtra("EXTRA_OPEN_NOTIFICATIONS", false) ?: false
    }
}

enum class NavigationScreen(val label: String, val icon: ImageVector, val tag: String) {
    SEARCH("Search", Icons.Default.Search, "nav_search"),
    RADAR("Radar", Icons.Default.Radar, "nav_radar"),
    CONNECTIONS("Routes", Icons.Default.Hub, "nav_connections"),
    BOARDS("Airports", Icons.Default.FlightTakeoff, "nav_boards"),
    TERMINALS("Terminals", Icons.Default.Layers, "nav_terminals"),
    FAVORITES("Watchlist", Icons.Default.Favorite, "nav_favorites")
}

@Composable
fun SkyTrackApp(
    viewModel: FlightViewModel = viewModel(),
    connectionsViewModel: com.example.ui.viewmodel.ConnectionsViewModel = viewModel(),
    initialFlightNumber: String? = null,
    initialOpenNotifications: Boolean = false,
    themeMode: ThemeMode = ThemeMode.SYSTEM,
    onThemeModeChange: (ThemeMode) -> Unit = {}
) {
    var currentScreen by remember { mutableStateOf(NavigationScreen.SEARCH) }
    var selectedDetailFlight by remember { mutableStateOf<Flight?>(null) }
    var googleMapFlight by remember { mutableStateOf<Flight?>(null) }
    var terminalAirportCode by remember { mutableStateOf<String?>(null) }
    var terminalGate by remember { mutableStateOf<String?>(null) }
    var showTerminalOverlay by remember { mutableStateOf(false) }
    var showNotificationsDialog by remember { mutableStateOf(initialOpenNotifications) }
    var showAccountDialog by remember { mutableStateOf(false) }

    val alerts by viewModel.alerts.collectAsState()
    val scheduledAlerts by viewModel.scheduledNotifications.collectAsState()
    val unreadAlerts by viewModel.unreadAlertCount.collectAsState()
    val userAccount by viewModel.userAccount.collectAsState()
    val favorites by viewModel.favoriteFlights.collectAsState()
    val allFlights by viewModel.flights.collectAsState()

    // Request POST_NOTIFICATIONS permission for Android 13+ (API 33+)
    val notificationPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission()
    ) { _ -> }

    LaunchedEffect(Unit) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    // Handle initial intent flight selection
    LaunchedEffect(initialFlightNumber, allFlights) {
        if (!initialFlightNumber.isNullOrBlank() && selectedDetailFlight == null) {
            val matched = allFlights.find {
                it.flightNumber.replace(" ", "").equals(initialFlightNumber.replace(" ", ""), ignoreCase = true)
            }
            if (matched != null) {
                selectedDetailFlight = matched
            }
        }
    }

    // Handle back button when overlay, Google Maps, flight detail, or secondary tab is open
    BackHandler(
        enabled = showTerminalOverlay || googleMapFlight != null || selectedDetailFlight != null || currentScreen != NavigationScreen.SEARCH
    ) {
        if (showTerminalOverlay) {
            showTerminalOverlay = false
        } else if (googleMapFlight != null) {
            googleMapFlight = null
        } else if (selectedDetailFlight != null) {
            selectedDetailFlight = null
        } else {
            currentScreen = NavigationScreen.SEARCH
        }
    }

    Scaffold(
        modifier = Modifier.fillMaxSize().testTag("skytrack_main_scaffold"),
        containerColor = DeepSpace,
        bottomBar = {
            if (!showTerminalOverlay && selectedDetailFlight == null && googleMapFlight == null) {
                NavigationBar(
                    containerColor = CockpitDark,
                    tonalElevation = 6.dp,
                    windowInsets = WindowInsets.navigationBars,
                    modifier = Modifier
                        .border(
                            0.8.dp,
                            InstrumentBorder,
                            RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp)
                        )
                        .clip(RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp))
                ) {
                    NavigationScreen.values().forEach { screen ->
                        val isSelected = currentScreen == screen
                        NavigationBarItem(
                            selected = isSelected,
                            onClick = {
                                selectedDetailFlight = null
                                googleMapFlight = null
                                showTerminalOverlay = false
                                currentScreen = screen
                            },
                            icon = {
                                if (screen == NavigationScreen.FAVORITES && favorites.isNotEmpty()) {
                                    BadgedBox(
                                        badge = {
                                            Badge(
                                                containerColor = RadarCyan,
                                                contentColor = DeepSpace
                                            ) {
                                                Text("${favorites.size}", fontWeight = FontWeight.Bold)
                                            }
                                        }
                                    ) {
                                        Icon(screen.icon, contentDescription = screen.label)
                                    }
                                } else {
                                    Icon(screen.icon, contentDescription = screen.label)
                                }
                            },
                            label = {
                                Text(
                                    text = screen.label,
                                    fontSize = 10.sp,
                                    maxLines = 1,
                                    softWrap = false,
                                    fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium
                                )
                            },
                            colors = NavigationBarItemDefaults.colors(
                                selectedIconColor = DeepSpace,
                                unselectedIconColor = TextMuted,
                                selectedTextColor = RadarCyan,
                                unselectedTextColor = TextMuted,
                                indicatorColor = RadarCyan
                            ),
                            modifier = Modifier.testTag(screen.tag)
                        )
                    }
                }
            }
        }
    ) { innerPadding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
        ) {
            if (showTerminalOverlay) {
                TerminalMapScreen(
                    initialAirportCode = terminalAirportCode ?: "JFK",
                    initialGate = terminalGate,
                    onBack = { showTerminalOverlay = false },
                    modifier = Modifier.fillMaxSize()
                )
            } else if (googleMapFlight != null) {
                val liveGoogleMapFlight = allFlights.find { it.id == googleMapFlight!!.id } ?: googleMapFlight!!
                GoogleFlightMapScreen(
                    flight = liveGoogleMapFlight,
                    onBack = { googleMapFlight = null },
                    modifier = Modifier.fillMaxSize()
                )
            } else if (selectedDetailFlight != null) {
                val liveFlight = allFlights.find { it.id == selectedDetailFlight!!.id } ?: selectedDetailFlight!!

                FlightDetailScreen(
                    flight = liveFlight,
                    viewModel = viewModel,
                    onBack = { selectedDetailFlight = null },
                    onOpenGoogleMap = { googleMapFlight = liveFlight },
                    onOpenTerminalMap = { airportCode, gate ->
                        terminalAirportCode = airportCode
                        terminalGate = gate
                        showTerminalOverlay = true
                    },
                    modifier = Modifier.fillMaxSize()
                )
            } else {
                when (currentScreen) {
                    NavigationScreen.SEARCH -> {
                        FlightSearchScreen(
                            viewModel = viewModel,
                            onFlightSelected = {
                                viewModel.recordRecentSearch(it)
                                selectedDetailFlight = it
                            },
                            onOpenNotifications = { showNotificationsDialog = true },
                            onOpenAccount = { showAccountDialog = true },
                            modifier = Modifier.fillMaxSize()
                        )
                    }
                    NavigationScreen.RADAR -> {
                        LiveRadarScreen(
                            viewModel = viewModel,
                            onFlightSelected = { selectedDetailFlight = it },
                            modifier = Modifier.fillMaxSize()
                        )
                    }
                    NavigationScreen.CONNECTIONS -> {
                        ConnectionsScreen(
                            connectionsViewModel = connectionsViewModel,
                            onOpenRouteFlights = { originIata, destIata ->
                                val directFlight = allFlights.find {
                                    it.origin.code.equals(originIata, ignoreCase = true) &&
                                        it.destination.code.equals(destIata, ignoreCase = true)
                                }
                                if (directFlight != null) {
                                    selectedDetailFlight = directFlight
                                } else {
                                    viewModel.setSearchMode(com.example.ui.viewmodel.SearchMode.ROUTE)
                                    viewModel.setRouteOrigin(originIata)
                                    viewModel.setRouteDestination(destIata)
                                    currentScreen = NavigationScreen.SEARCH
                                }
                            },
                            onOpenAirportBoard = { airportIata ->
                                viewModel.selectAirport(airportIata)
                                currentScreen = NavigationScreen.BOARDS
                            },
                            modifier = Modifier.fillMaxSize()
                        )
                    }
                    NavigationScreen.BOARDS -> {
                        AirportBoardScreen(
                            viewModel = viewModel,
                            onFlightSelected = { selectedDetailFlight = it },
                            onOpenConnectionsMap = { airportCode ->
                                connectionsViewModel.selectOriginHub(airportCode)
                                currentScreen = NavigationScreen.CONNECTIONS
                            },
                            modifier = Modifier.fillMaxSize()
                        )
                    }
                    NavigationScreen.TERMINALS -> {
                        TerminalMapScreen(
                            initialAirportCode = "JFK",
                            initialGate = null,
                            onBack = null,
                            modifier = Modifier.fillMaxSize()
                        )
                    }
                    NavigationScreen.FAVORITES -> {
                        FavoritesScreen(
                            viewModel = viewModel,
                            onFlightSelected = { selectedDetailFlight = it },
                            modifier = Modifier.fillMaxSize()
                        )
                    }
                }
            }
        }
    }

    // Real-time Flight Alerts Dialog
    if (showNotificationsDialog) {
        NotificationsDialog(
            alerts = alerts,
            scheduledAlerts = scheduledAlerts,
            savedFlights = favorites.ifEmpty { allFlights.take(4) },
            fcmToken = viewModel.getFcmToken(),
            onDismiss = { showNotificationsDialog = false },
            onMarkAllRead = { viewModel.markAllAlertsRead() },
            onMarkRead = { alertId -> viewModel.markAlertRead(alertId) },
            onCancelSchedule = { scheduleId -> viewModel.cancelScheduledAlert(scheduleId) },
            onTriggerTestAlert = { flightNum, type -> viewModel.simulateAlert(flightNum, type) }
        )
    }

    // OAuth Login & Aviation Account Dialog
    if (showAccountDialog) {
        OAuthLoginDialog(
            account = userAccount,
            themeMode = themeMode,
            onThemeModeChange = onThemeModeChange,
            onDismiss = { showAccountDialog = false },
            onSignIn = { provider -> viewModel.signInWithOAuth(provider) },
            onSignOut = { viewModel.signOut() },
            onToggleOffline = { viewModel.toggleOfflineMode() },
            onRefreshSync = { viewModel.refreshData() }
        )
    }
}
