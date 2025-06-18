import time
import board
import digitalio
import busio
import displayio
import terminalio
import adafruit_displayio_ssd1306
from adafruit_display_text import label
from adafruit_display_shapes.rect import Rect
from adafruit_display_shapes.circle import Circle
from adafruit_display_shapes.line import Line
import adafruit_requests as requests
import wifi
import socketpool
import ssl
import math

# Release any resources currently in use for the displays
displayio.release_displays()

# Initialize I2C
i2c = busio.I2C(scl=board.SCL, sda=board.SDA)

# Initialize the OLED display
WIDTH = 128
HEIGHT = 64
BORDER = 0

display_bus = displayio.I2CDisplay(i2c, device_address=0x3C)  # Common address, might need to change
display = adafruit_displayio_ssd1306.SSD1306(display_bus, width=WIDTH, height=HEIGHT, rotation=180)

# Button setup
button = digitalio.DigitalInOut(board.A2)
button.direction = digitalio.Direction.INPUT
button.pull = digitalio.Pull.UP  # Use pull-up resistor

# LED setup
led = digitalio.DigitalInOut(board.A0)
led.direction = digitalio.Direction.OUTPUT

# Wi-Fi setup
WIFI_SSID = "REDACTED"
WIFI_PASSWORD = "REDACTED"

# API setup
API_BASE_URL = "http://api.viruus.zip/esp32"
API_MESSAGES_URL = API_BASE_URL + "/messages"
API_READ_URL = API_BASE_URL + "/read"
AUTH_HEADER = {"Authorization": "REDACTED"}

# Variables
current_message = ""
last_message = ""
error_message = ""
led_flashing = False
api_success = True
loading_angle = 0  # Angle for spinning square
button_pressed = False
button_last_state = False
last_debounce_time = 0
debounce_delay = 0.02  # 50 ms debounce time
last_led_toggle_time = 0
led_toggle_interval = 0.3  # Flash LED every 0.5 seconds
last_api_call_time = 0
api_call_interval = 30  # Check API every 5 seconds

# Function to wrap text for OLED display
def wrap_text(text, max_width):
    words = text.split(" ")
    lines = []
    current_line = ""
    for word in words:
        if len(current_line) + len(word) + 1 <= max_width:
            current_line += word + " "
        else:
            lines.append(current_line.strip())
            current_line = word + " "
    lines.append(current_line.strip())
    return lines

# Function to display loading screen
def display_loading_screen(status_text):
    global loading_angle

    splash = displayio.Group()
    bg_bitmap = displayio.Bitmap(WIDTH, HEIGHT, 1)
    bg_palette = displayio.Palette(1)
    bg_palette[0] = 0x000000  # Black
    bg_sprite = displayio.TileGrid(bg_bitmap, pixel_shader=bg_palette, x=0, y=0)
    splash.append(bg_sprite)

    # Draw border
    border = Rect(0, 0, WIDTH, HEIGHT, outline=0xFFFFFF)
    splash.append(border)

    # Draw circle (loading animation container)
    circle_radius = 15
    circle_x = WIDTH // 2
    circle_y = 20  # Top padding
    loading_circle = Circle(circle_x, circle_y, circle_radius, outline=0xFFFFFF)
    splash.append(loading_circle)

    # Draw spinning square
    square_size = 8
    angle_rad = math.radians(loading_angle)
    square_x = int(circle_x + (circle_radius - square_size / 2) * math.cos(angle_rad))
    square_y = int(circle_y + (circle_radius - square_size / 2) * math.sin(angle_rad))
    spinning_square = Rect(square_x, square_y, square_size, square_size, fill=0xFFFFFF)
    splash.append(spinning_square)

    # Update loading angle for next frame
    loading_angle = (loading_angle + 10) % 360

    # Display status text at the bottom
    status_label = label.Label(
        terminalio.FONT,
        text=status_text,
        color=0xFFFFFF,
        x=10,
        y=HEIGHT - 10
    )
    splash.append(status_label)

    display.root_group = splash

# Function to display text on OLED
def display_text(text, x=10, y=20):  # Shifted down by 10 pixels (y=20 instead of y=10)
    splash = displayio.Group()
    bg_bitmap = displayio.Bitmap(WIDTH, HEIGHT, 1)
    bg_palette = displayio.Palette(1)
    bg_palette[0] = 0x000000  # Black
    bg_sprite = displayio.TileGrid(bg_bitmap, pixel_shader=bg_palette, x=0, y=0)
    splash.append(bg_sprite)

    # Draw border
    border = Rect(0, 0, WIDTH, HEIGHT, outline=0xFFFFFF)
    splash.append(border)

    # Draw status icon (checkmark or cross)
    if api_success:
        # Draw checkmark
        checkmark = Line(WIDTH - 15, 5, WIDTH - 10, 10, color=0xFFFFFF)
        splash.append(checkmark)
        checkmark = Line(WIDTH - 10, 10, WIDTH - 5, 5, color=0xFFFFFF)
        splash.append(checkmark)
    else:
        # Draw cross
        cross1 = Line(WIDTH - 15, 5, WIDTH - 5, 15, color=0xFFFFFF)
        splash.append(cross1)
        cross2 = Line(WIDTH - 15, 15, WIDTH - 5, 5, color=0xFFFFFF)
        splash.append(cross2)

    # Display wrapped text
    wrapped_text = wrap_text(text, 20)  # Adjust max_width as needed
    for i, line in enumerate(wrapped_text):
        text_area = label.Label(
            terminalio.FONT,
            text=line,
            color=0xFFFFFF,
            x=x,
            y=y + i * 10  # Shifted down by 10 pixels
        )
        splash.append(text_area)

    display.root_group = splash

# Function to send message read notification to the API
def send_read_notification():
    try:
        display_loading_screen("Sending read status")
        response = http.post(API_READ_URL, headers=AUTH_HEADER, json={})
        response_code = response.status_code
        response.close()
        if response_code == 200:
            print("Message read notification sent successfully")
            return True
        else:
            print(f"Failed to send read notification: {response_code}")
            return False
    except Exception as e:
        print(f"Error sending read notification: {str(e)}")
        return False

# Show initial loading screen while connecting to Wi-Fi
display_loading_screen("Connecting to Wi-Fi")

try:
    # Connect to Wi-Fi
    wifi.radio.connect(WIFI_SSID, WIFI_PASSWORD)
    pool = socketpool.SocketPool(wifi.radio)
    ssl_context = ssl.create_default_context()
    http = requests.Session(pool, ssl_context)
    print("Connected to Wi-Fi")
    api_success = True
except Exception as e:
    print(f"Wi-Fi connection failed: {e}")
    error_message = f"Wi-Fi Error: {str(e)}"
    api_success = False

# Main loop
while True:
    current_time = time.monotonic()
    
    # Button debouncing
    reading = not button.value  # Invert because of pull-up
    
    # If the button state has changed, reset the debounce timer
    if reading != button_last_state:
        last_debounce_time = current_time
    
    # Check if button state is stable for the debounce period
    if (current_time - last_debounce_time) > debounce_delay:
        # If the button state has changed (debounced)
        if reading != button_pressed:
            button_pressed = reading
            # Button press actions (on press, not release)
            if button_pressed:
                if led_flashing:
                    # Stop LED flashing when button is pressed while flashing
                    led_flashing = False
                    led.value = False
                    # Send read notification to the API
                    send_read_notification()
                elif not api_success:
                    # Show error message when pressing button and there's an error
                    display_text(error_message)
    
    button_last_state = reading
    
    # API polling with rate limiting
    if (current_time - last_api_call_time) >= api_call_interval:
        last_api_call_time = current_time
        try:
            # Ping the API
            response = http.get(API_MESSAGES_URL, headers=AUTH_HEADER)
            if response.status_code == 200:
                api_success = True
                new_message = response.text
                response.close()
                
                # Check if a new message is received
                if new_message != current_message:
                    current_message = new_message
                    last_message = new_message
                    led_flashing = True  # Start LED flashing for new message
            else:
                api_success = False
                error_message = f"API Error: {response.status_code}"
                response.close()
        except Exception as e:
            api_success = False
            error_message = f"Connection Error: {str(e)}"
    
    # LED flashing with controlled timing
    if led_flashing and (current_time - last_led_toggle_time) >= led_toggle_interval:
        last_led_toggle_time = current_time
        led.value = not led.value
    elif not led_flashing:
        led.value = False
    
    # Display logic simplified
    if led_flashing or (button_pressed and not api_success):
        display_text(current_message if led_flashing else error_message)
    else:
        display_text(current_message)
    
    # Small delay to prevent excessive CPU usage
    time.sleep(0.1)