"""Bambu Lab Printer Service - Cloud & LAN Mode Integration"""

import asyncio
import logging
import httpx
import json
import os
import ssl
from ftplib import FTP, FTP_TLS
from typing import Dict, Any, Optional
from datetime import datetime

import paho.mqtt.client as mqtt
import bambulabs_api as bl

logger = logging.getLogger(__name__)


def _to_int(value: Any, default: int = -1) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


class ImplicitFTP_TLS(FTP_TLS):
    """
    FTP_TLS-Subklasse für *implicit* TLS (Bambu Lab nutzt FTPS auf Port 990).

    Pythons ftplib unterstützt nur *explicit* FTPS (AUTH TLS nach Klartext-Connect).
    Bambu-Drucker erwarten aber eine sofort TLS-verschlüsselte Verbindung.
    Daher wird hier das `sock`-Property überschrieben: sobald der rohe Socket
    gesetzt wird, umschließen wir ihn direkt mit dem SSL-Context.
    """

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._sock = None

    @property
    def sock(self):
        """Aktueller Socket."""
        return self._sock

    @sock.setter
    def sock(self, value):
        """Beim Setzen des Sockets sofort in TLS wrappen (implicit TLS)."""
        if value is not None and not isinstance(value, ssl.SSLSocket):
            value = self.context.wrap_socket(value)
        self._sock = value

    def ntransfercmd(self, cmd, rest=None):
        """
        Datenkanal TLS-verschlüsseln UND die TLS-Session der Steuerverbindung
        wiederverwenden.

        Bambu-Drucker (wie viele FTPS-Server mit "require TLS session reuse")
        akzeptieren den Datenkanal nur, wenn er dieselbe TLS-Session wie die
        Steuerverbindung nutzt. Ohne Session-Reuse hängt der Transfer und läuft
        in einen Timeout ("read operation timed out").
        """
        conn, size = FTP.ntransfercmd(self, cmd, rest)
        if self._prot_p:
            conn = self.context.wrap_socket(
                conn,
                session=self.sock.session,
            )
        return conn, size

    def storbinary(self, cmd, fp, blocksize=8192, callback=None, rest=None):
        """
        Upload wie FTP_TLS.storbinary, aber OHNE den abschließenden conn.unwrap().

        Bambu-Drucker schließen den TLS-Datenkanal nicht sauber (sie senden kein
        close_notify), wodurch das unwrap() in Pythons Standard-Implementierung in
        einen Timeout läuft - OBWOHL die Daten bereits vollständig übertragen sind.
        Wir schließen den Datenkanal daher direkt (kein unwrap) und lesen dann die
        Server-Antwort (226 Transfer complete).
        """
        self.voidcmd("TYPE I")
        conn = self.transfercmd(cmd, rest)
        try:
            while True:
                buf = fp.read(blocksize)
                if not buf:
                    break
                conn.sendall(buf)
                if callback:
                    callback(buf)
        finally:
            conn.close()
        return self.voidresp()


class BambuLabPrinter:
    """Bambu Lab Cloud & LAN Integration"""

    def __init__(self, use_cloud: bool = False):
        self.use_cloud = use_cloud
        self.is_mock = False
        self.is_connected = False
        self._jwt_token: Optional[str] = None
        self._device_id: Optional[str] = None
        self._mqtt_client: Optional[mqtt.Client] = None

        # Cache für den zuletzt empfangenen MQTT `print`-Report-Block
        self._latest_print_report: Dict[str, Any] = {}
        # Flag, das von on_connect gesetzt wird (rc == 0)
        self._mqtt_connected = False
        # Name der zuletzt per FTPS hochgeladenen Datei (für Druckbefehl)
        self._uploaded_filename: Optional[str] = None

        # Cloud Settings
        self.cloud_email = os.getenv("BAMBU_EMAIL", "")
        self.cloud_password = os.getenv("BAMBU_PASSWORD", "")
        self.cloud_uid = os.getenv("BAMBU_UID", "")
        # printer_serial ist ein Property -> setzt self._printer_serial
        self.printer_serial = os.getenv("BAMBU_PRINTER_SERIAL", "")
        self.mqtt_host = os.getenv("BAMBU_MQTT_HOST", "mqtt.bambulab.com")
        self.mqtt_port = int(os.getenv("BAMBU_MQTT_PORT", "8883"))
        self.mqtt_tls = os.getenv("BAMBU_MQTT_TLS", "true").lower() == "true"

        # LAN Settings
        self.lan_ip = os.getenv("BAMBU_LOCAL_IP", "")
        self.lan_access_code = os.getenv("BAMBU_ACCESS_CODE", "")
        # AMS verwenden? (False = externe Spule). Bestimmt start_print(use_ams=...).
        self.use_ams = os.getenv("BAMBU_USE_AMS", "false").lower() == "true"
        # AMS-Tray-Index, aus dem gedruckt wird (Filament-Mapping für die eine
        # Farbe der geslicten 3MF). Default 0 = erster Slot.
        self.ams_tray = int(os.getenv("BAMBU_AMS_TRAY", "0"))

        # bambulabs-api Printer-Instanz (LAN). Übernimmt FTP-Upload + MQTT-
        # Druckstart mit dem firmware-getesteten Befehlsablauf.
        self._bl: Optional[bl.Printer] = None

        self.api_url = "https://api.bambulab.com"
        self._http_client: Optional[httpx.AsyncClient] = None

    async def connect(self) -> bool:
        """Verbinde mit Drucker (Cloud oder LAN)"""
        try:
            if self.use_cloud:
                logger.info("Connecting to Bambu Lab Cloud...")
                return await self._connect_cloud()
            else:
                logger.info("Connecting to Bambu Lab LAN...")
                return await self._connect_lan()
        except Exception as exc:
            logger.error(f"Failed to connect: {exc}")
            return False

    async def _connect_cloud(self) -> bool:
        """Authentifiziere und verbinde mit Cloud API"""
        try:
            if not self.cloud_email or not self.cloud_password:
                logger.error("Cloud credentials missing (BAMBU_EMAIL, BAMBU_PASSWORD)")
                return False

            # Authentifizierung
            self._http_client = httpx.AsyncClient(verify=True, timeout=30.0)

            # Login (vereinfacht - echte Impl. würde 2FA handhaben)
            auth_data = {
                "email": self.cloud_email,
                "password": self.cloud_password,
            }

            response = await self._http_client.post(
                f"{self.api_url}/v1/user/login",
                json=auth_data,
            )

            if response.status_code != 200:
                logger.error(f"Auth failed: {response.text}")
                return False

            result = response.json()
            self._jwt_token = result.get("accessToken")

            if not self._jwt_token:
                logger.error("No JWT token in response")
                return False

            logger.info("✓ Cloud authenticated successfully")
            self.is_connected = True
            return True

        except Exception as exc:
            logger.error(f"Cloud connection failed: {exc}")
            return False

    async def _connect_lan(self) -> bool:
        """
        Verbinde mit LAN-Drucker über MQTT (TLS, Port 8883).

        Echte Bambu-Drucker bieten KEINE REST-API im LAN-Modus. Status und
        Befehle laufen über MQTT, der 3MF-Upload über FTPS (siehe send_file).
        Die Seriennummer wird auch im LAN-Modus für die MQTT-Topics benötigt.
        """
        try:
            # Bereits verbunden? Wiederverwenden - der Drucker erlaubt im LAN nur
            # EINE gleichzeitige MQTT-Verbindung. (Jeder Druckjob ruft connect()
            # auf; ohne diese Prüfung würde eine zweite Verbindung blockieren.)
            if self._bl is not None and self.is_connected:
                logger.info("LAN printer already connected - reusing connection")
                return True

            if not self.lan_ip or not self.lan_access_code:
                logger.error("LAN credentials missing (BAMBU_LOCAL_IP, BAMBU_ACCESS_CODE)")
                return False

            if not self.printer_serial or self.printer_serial == "Unknown":
                logger.error("LAN mode requires printer serial (BAMBU_PRINTER_SERIAL)")
                return False

            logger.info(f"Connecting to LAN printer at {self.lan_ip} via bambulabs-api...")

            # bambulabs-api übernimmt MQTT (Status/Befehle) + FTP-Upload + den
            # firmware-getesteten Druckstart. connect() ist blockierend.
            printer = bl.Printer(self.lan_ip, self.lan_access_code, self.printer_serial)
            await asyncio.to_thread(printer.connect)
            self._bl = printer

            # Auf MQTT-Bereitschaft warten (max. 10s)
            ready = False
            for _ in range(100):
                try:
                    if printer.mqtt_client_connected():
                        ready = True
                        break
                except Exception:
                    pass
                await asyncio.sleep(0.1)

            if not ready:
                logger.error("bambulabs-api MQTT connection timed out (10s)")
                try:
                    printer.disconnect()
                except Exception:
                    pass
                self._bl = None
                return False

            logger.info("✓ LAN connection successful (bambulabs-api)")
            self.is_connected = True
            return True

        except Exception as exc:
            logger.error(f"LAN connection failed: {exc}")
            return False

    def _on_mqtt_connect(self, client, userdata, flags, rc):
        """MQTT-Callback: bei rc=0 als verbunden markieren und report abonnieren."""
        if rc == 0:
            self._mqtt_connected = True
            topic = f"device/{self.printer_serial}/report"
            client.subscribe(topic)
            logger.info(f"MQTT connected, subscribed to {topic}")
        else:
            logger.error(f"MQTT connect failed with rc={rc}")

    def _on_mqtt_message(self, client, userdata, msg):
        """MQTT-Callback: report-Messages parsen und print-Block cachen."""
        try:
            payload = json.loads(msg.payload.decode("utf-8"))
            print_block = payload.get("print")
            if print_block:
                # Drucker sendet oft nur Deltas -> bestehenden Cache mergen
                self._latest_print_report.update(print_block)
        except Exception as exc:
            logger.error(f"Failed to parse MQTT report: {exc}")

    def _mqtt_publish(self, payload: Dict[str, Any]) -> bool:
        """Publish auf device/{serial}/request (blockierend, synchron)."""
        if not self._mqtt_client:
            logger.error("MQTT client not connected")
            return False
        topic = f"device/{self.printer_serial}/request"
        result = self._mqtt_client.publish(topic, json.dumps(payload))
        return result.rc == mqtt.MQTT_ERR_SUCCESS

    async def disconnect(self):
        """Trenne Verbindung (HTTP-Client + bambulabs-api)"""
        if self._http_client:
            await self._http_client.aclose()
            self._http_client = None
        if self._bl is not None:
            try:
                self._bl.disconnect()
            except Exception as exc:
                logger.error(f"Error while disconnecting bambulabs-api: {exc}")
            self._bl = None
        self._mqtt_connected = False
        self.is_connected = False
        logger.info("Disconnected from printer")

    async def get_status(self) -> Dict[str, Any]:
        """Hole Drucker-Status"""
        if not self.is_connected:
            return {
                "status": "offline",
                "temperature_nozzle": 0,
                "temperature_bed": 0,
                "progress": 0,
                "current_file": None,
            }

        try:
            if self.use_cloud:
                return await self._get_status_cloud()
            else:
                return await self._get_status_lan()
        except Exception as exc:
            logger.error(f"Failed to get status: {exc}")
            return {"status": "error", "error": str(exc)}

    async def _get_status_cloud(self) -> Dict[str, Any]:
        """Hole Status über Cloud API"""
        try:
            headers = {"Authorization": f"Bearer {self._jwt_token}"}

            response = await self._http_client.get(
                f"{self.api_url}/v1/iot-service/api/user/device/{self.printer_serial}",
                headers=headers,
            )

            if response.status_code != 200:
                logger.error(f"Cloud status failed: {response.status_code}")
                return {"status": "error"}

            device_data = response.json()
            device_info = device_data.get("data", {})

            return {
                "status": device_info.get("print_status", "idle"),
                "temperature_nozzle": device_info.get("nozzle_temperature", 0),
                "temperature_bed": device_info.get("bed_temperature", 0),
                "progress": device_info.get("progress", 0),
                "current_file": device_info.get("current_file"),
            }

        except Exception as exc:
            logger.error(f"Cloud status error: {exc}")
            return {"status": "error"}

    async def _get_status_lan(self) -> Dict[str, Any]:
        """Hole Status über bambulabs-api (liest die gecachten MQTT-Report-Daten)."""
        if self._bl is None:
            return {
                "status": "offline",
                "temperature_nozzle": 0,
                "temperature_bed": 0,
                "progress": 0,
                "current_file": None,
            }
        try:
            state = self._bl.get_state()
            pct = self._bl.get_percentage()
            return {
                "status": getattr(state, "name", str(state)),
                "temperature_nozzle": self._bl.get_nozzle_temperature() or 0,
                "temperature_bed": self._bl.get_bed_temperature() or 0,
                "progress": pct if isinstance(pct, int) else 0,
                "current_file": self._bl.get_file_name() or None,
            }
        except Exception as exc:
            logger.error(f"LAN status error: {exc}")
            return {"status": "error"}

    async def get_ams_info(self) -> Dict[str, Any]:
        """
        AMS-Einheiten samt Trays auslesen (Filament-Typ, Farbe, Restmenge).

        Liest die rohen AMS-Daten aus dem MQTT-Report (vollständigste Quelle).
        Farbe ist ein Hex-String RRGGBBAA.
        """
        if self.use_cloud or self._bl is None:
            return {"available": False, "units": []}
        try:
            dump = await asyncio.to_thread(self._bl.mqtt_dump)
        except Exception as exc:
            logger.error(f"AMS read failed: {exc}")
            return {"available": False, "units": [], "error": str(exc)}

        ams_block = (dump.get("print", {}) or {}).get("ams", {})
        raw_units = ams_block.get("ams", []) if isinstance(ams_block, dict) else []

        units = []
        for unit in raw_units:
            trays = []
            for t in unit.get("tray", []):
                tray_type = t.get("tray_type") or None
                trays.append({
                    "id": _to_int(t.get("id")),
                    "type": tray_type,
                    "color": t.get("tray_color") or None,   # hex RRGGBBAA
                    "name": t.get("tray_sub_brands") or tray_type,
                    "remain": t.get("remain", -1),           # % (nur X1)
                    "empty": not tray_type,
                })
            units.append({
                "id": _to_int(unit.get("id")),
                "humidity": unit.get("humidity"),
                "temperature": unit.get("temp"),
                "trays": trays,
            })
        return {"available": bool(units), "units": units}

    async def send_file(self, file_path: str) -> bool:
        """
        Sende Datei zum Drucker und starte den Druck (LAN via bambulabs-api).

        Die Library übernimmt den FTP-Upload an den korrekten Ort und den
        firmware-getesteten Druckstart. Cloud: aktuell nicht implementiert.
        """
        if not self.is_connected:
            raise Exception("Not connected to printer")

        if self.use_cloud:
            logger.warning("send_file über Cloud ist nicht implementiert")
            return False

        if self._bl is None:
            logger.error("LAN printer (bambulabs-api) not initialized")
            return False

        filename = os.path.basename(file_path)
        logger.info(f"Uploading {filename} to LAN printer (bambulabs-api)...")

        def _upload_and_print():
            with open(file_path, "rb") as fileobj:
                self._bl.upload_file(fileobj, filename)
            # plate 1 (unsere geslicte 3MF hat genau eine Platte). Bei AMS wird
            # die eine Filament-Farbe auf den konfigurierten Tray gemappt.
            if self.use_ams:
                return self._bl.start_print(
                    filename, 1, use_ams=True, ams_mapping=[self.ams_tray]
                )
            return self._bl.start_print(filename, 1, use_ams=False)

        try:
            ok = await asyncio.to_thread(_upload_and_print)
        except Exception as exc:
            logger.error(f"Upload/start_print failed: {exc}")
            return False

        self._uploaded_filename = filename
        if ok:
            logger.info(f"✓ Uploaded and print started: {filename} (use_ams={self.use_ams})")
        else:
            logger.warning(f"Upload OK, aber start_print lieferte False für {filename}")
        return bool(ok)

    def _ftps_upload(self, file_path: str, filename: str):
        """
        Lade die Datei per implicit FTPS (Port 990) nach /cache hoch.

        /cache ist das Verzeichnis, in dem der Drucker startbare Druckjobs ablegt
        (dort liegen auch die vom Slicer/der App gesendeten Dateien). Im Root
        abgelegte Dateien werden NICHT als Druck-Task erkannt.

        Login: user=bblp, passwd=Access Code. Zertifikatsprüfung deaktiviert,
        da der Drucker ein selfsigned Zertifikat verwendet. Blockierend ->
        Aufruf erfolgt aus asyncio.to_thread().
        """
        context = ssl.create_default_context()
        context.check_hostname = False
        context.verify_mode = ssl.CERT_NONE

        ftp = ImplicitFTP_TLS(context=context)
        try:
            ftp.connect(host=self.lan_ip, port=990, timeout=30)
            ftp.login(user="bblp", passwd=self.lan_access_code)
            # Datenkanal ebenfalls verschlüsseln
            ftp.prot_p()

            with open(file_path, "rb") as fileobj:
                ftp.storbinary(f"STOR /cache/{filename}", fileobj)
        finally:
            try:
                ftp.quit()
            except Exception:
                try:
                    ftp.close()
                except Exception:
                    pass

    async def pause_print(self) -> bool:
        """Pausiere Druck"""
        if self.use_cloud:
            return await self._mqtt_command("pause")
        else:
            return await self._lan_command("pause")

    async def resume_print(self) -> bool:
        """Fortsetzen"""
        if self.use_cloud:
            return await self._mqtt_command("resume")
        else:
            return await self._lan_command("resume")

    async def cancel_print(self) -> bool:
        """Abbrechen"""
        if self.use_cloud:
            return await self._mqtt_command("stop")
        else:
            return await self._lan_command("stop")

    async def _mqtt_command(self, command: str) -> bool:
        """Sende Befehl über MQTT (Cloud)"""
        logger.info(f"MQTT command: {command}")
        # TODO: MQTT Cloud Implementation
        return True

    async def _lan_command(self, command: str) -> bool:
        """Sende pause/resume/stop über bambulabs-api (LAN)."""
        if self._bl is None:
            logger.error("LAN printer (bambulabs-api) not initialized")
            return False
        try:
            fn = {
                "pause": self._bl.pause_print,
                "resume": self._bl.resume_print,
                "stop": self._bl.stop_print,
            }.get(command)
            if fn is None:
                logger.error(f"Unknown LAN command: {command}")
                return False
            return bool(await asyncio.to_thread(fn))

        except Exception as exc:
            logger.error(f"LAN command error: {exc}")
            return False

    @property
    def is_available(self) -> bool:
        """Ist Drucker verfügbar?"""
        return self.is_connected

    @property
    def printer_serial(self) -> str:
        """Drucker-Seriennummer"""
        return self._printer_serial or "Unknown"

    @printer_serial.setter
    def printer_serial(self, value: str):
        self._printer_serial = value

    @property
    def printer_ip(self) -> Optional[str]:
        """Drucker-IP (LAN)"""
        return self.lan_ip if self.lan_ip else None
