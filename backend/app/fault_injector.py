import random
from typing import Dict, Any, Optional


class FaultInjector:

    def __init__(self):
        self.active_fault: Optional[Dict[str, Any]] = None
        self.tick_counter = 0

    def inject_fault(
        self,
        fault_type: str,
        affected_sensor: str = "temperature",
        severity: float = 1.0,
        duration: int = 30
    ):
        """
        Inject a synthetic fault into the telemetry stream.
        """

        self.active_fault = {
            "fault_type": fault_type.upper(),
            "affected_sensor": affected_sensor.lower(),
            "severity": severity,
            "duration": duration,
            "elapsed_ticks": 0,
            "start_tick": self.tick_counter,
            "frozen_value": None,
            "ground_truth_flag": fault_type.upper()
        }

        print(
            f"[FAULT INJECTOR] Injected "
            f"{fault_type} on {affected_sensor} "
            f"(severity={severity}, duration={duration})"
        )

    def clear_fault(self):
        self.active_fault = None

        print(
            "[FAULT INJECTOR] Active fault cleared. "
            "Returning to clean baseline."
        )

    def apply_fault(
        self,
        observation: Dict[str, Any]
    ) -> Dict[str, Any]:

        self.tick_counter += 1

        modified = dict(observation)

        # Preserve clean baseline values.
        modified["clean_temperature"] = float(
            observation["temperature"]
        )

        modified["clean_humidity"] = float(
            observation["humidity"]
        )

        modified["clean_pressure"] = float(
            observation["pressure"]
        )

        modified["ground_truth_fault"] = "NORMAL"
        modified["ground_truth_sensor"] = "none"
        modified["fault_injected"] = False

        if not self.active_fault:
            return modified

        fault = self.active_fault

        fault["elapsed_ticks"] += 1

        if fault["elapsed_ticks"] > fault["duration"]:
            self.clear_fault()
            return modified

        ftype = fault["fault_type"]
        sensor = fault["affected_sensor"]
        sev = fault["severity"]
        elapsed = fault["elapsed_ticks"]

        modified["ground_truth_fault"] = ftype
        modified["ground_truth_sensor"] = sensor
        modified["fault_injected"] = True

        # ---------------------------------------------------------
        # TEMPERATURE SPIKE
        # ---------------------------------------------------------

        if ftype == "TEMPERATURE_SPIKE":

            if sensor in ["temperature", "all"]:
                modified["temperature"] = round(
                    modified["temperature"] + 10.5 * sev,
                    1
                )

        # ---------------------------------------------------------
        # TEMPERATURE DROP
        # ---------------------------------------------------------

        elif ftype == "TEMPERATURE_DROP":

            if sensor in ["temperature", "all"]:
                modified["temperature"] = round(
                    modified["temperature"] - 11.0 * sev,
                    1
                )

        # ---------------------------------------------------------
        # TEMPERATURE DRIFT
        # ---------------------------------------------------------

        elif ftype == "TEMPERATURE_DRIFT":

            if sensor in ["temperature", "all"]:

                drift_amount = (
                    1.2 * elapsed * sev
                )

                modified["temperature"] = round(
                    modified["temperature"] + drift_amount,
                    1
                )

        # ---------------------------------------------------------
        # TEMPERATURE BIAS
        # ---------------------------------------------------------

        elif ftype == "TEMPERATURE_BIAS":

            if sensor in ["temperature", "all"]:

                modified["temperature"] = round(
                    modified["temperature"] + 6.0 * sev,
                    1
                )

        # ---------------------------------------------------------
        # FROZEN / STUCK TEMPERATURE SENSOR
        # ---------------------------------------------------------

        elif ftype in [
            "FROZEN_TEMPERATURE",
            "STUCK_SENSOR"
        ]:

            if sensor in ["temperature", "all"]:

                if fault["frozen_value"] is None:
                    fault["frozen_value"] = float(
                        observation["temperature"]
                    )

                modified["temperature"] = fault["frozen_value"]

        # ---------------------------------------------------------
        # HUMIDITY SPIKE
        # ---------------------------------------------------------

        elif ftype == "HUMIDITY_SPIKE":

            if sensor in ["humidity", "all"]:

                modified["humidity"] = min(
                    100.0,
                    round(
                        modified["humidity"] + 35.0 * sev,
                        1
                    )
                )

        # ---------------------------------------------------------
        # HUMIDITY BIAS
        # ---------------------------------------------------------

        elif ftype == "HUMIDITY_BIAS":

            if sensor in ["humidity", "all"]:

                modified["humidity"] = max(
                    0.0,
                    round(
                        modified["humidity"] - 30.0 * sev,
                        1
                    )
                )

        # ---------------------------------------------------------
        # FROZEN HUMIDITY
        # ---------------------------------------------------------

        elif ftype == "FROZEN_HUMIDITY":

            if sensor in ["humidity", "all"]:

                if fault["frozen_value"] is None:
                    fault["frozen_value"] = float(
                        observation["humidity"]
                    )

                modified["humidity"] = fault["frozen_value"]

        # ---------------------------------------------------------
        # PRESSURE SPIKE
        # ---------------------------------------------------------

        elif ftype == "PRESSURE_SPIKE":

            if sensor in ["pressure", "all"]:

                modified["pressure"] = round(
                    modified["pressure"] + 25.0 * sev,
                    1
                )

        # ---------------------------------------------------------
        # PRESSURE DRIFT
        # ---------------------------------------------------------

        elif ftype == "PRESSURE_DRIFT":

            if sensor in ["pressure", "all"]:

                modified["pressure"] = round(
                    modified["pressure"] -
                    0.8 * elapsed * sev,
                    1
                )

        # ---------------------------------------------------------
        # RANDOM NOISE
        # ---------------------------------------------------------

        elif ftype == "RANDOM_NOISE":

            # Temperature
            if sensor in ["temperature", "all"]:

                modified["temperature"] = round(
                    modified["temperature"]
                    + random.gauss(0, 4.5 * sev),
                    1
                )

            # Humidity
            if sensor in ["humidity", "all"]:

                modified["humidity"] = max(
                    0.0,
                    min(
                        100.0,
                        round(
                            modified["humidity"]
                            + random.gauss(0, 11.0 * sev),
                            1
                        )
                    )
                )

            # Pressure
            if sensor in ["pressure", "all"]:

                modified["pressure"] = round(
                    modified["pressure"]
                    + random.gauss(0, 9.0 * sev),
                    1
                )

        # ---------------------------------------------------------
        # MISSING DATA
        # ---------------------------------------------------------

        elif ftype == "MISSING_DATA":

            if sensor in ["temperature", "all"]:
                modified["temperature"] = None

            if sensor in ["humidity", "all"]:
                modified["humidity"] = None

            if sensor in ["pressure", "all"]:
                modified["pressure"] = None

        # ---------------------------------------------------------
        # GENUINE WEATHER FRONT
        # ---------------------------------------------------------

        elif ftype == "GENUINE_WEATHER_FRONT":

            temp_shift = (
                0.7 * elapsed * sev
            )

            modified["temperature"] = round(
                observation["temperature"]
                + temp_shift,
                1
            )

            modified["humidity"] = max(
                12.0,
                round(
                    observation["humidity"]
                    - 2.8 * temp_shift,
                    1
                )
            )

            modified["pressure"] = round(
                observation["pressure"]
                - 0.45 * elapsed * sev,
                1
            )

            modified["ground_truth_fault"] = (
                "GENUINE_WEATHER_FRONT"
            )

        return modified
