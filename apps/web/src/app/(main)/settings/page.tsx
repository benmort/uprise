"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import {
  type AlertSoundProfile,
  type ResponderAlertSettings,
  DEFAULT_RESPONDER_ALERT_SETTINGS,
  loadResponderAlertSettings,
  playResponderAlertSound,
  saveResponderAlertSettings,
} from "@/lib/responder-alerts";

export default function SettingsPage() {
  const { showToast } = useToast();
  const [alertSettings, setAlertSettings] = useState<ResponderAlertSettings>(
    DEFAULT_RESPONDER_ALERT_SETTINGS,
  );

  useEffect(() => {
    setAlertSettings(loadResponderAlertSettings());
  }, []);

  useEffect(() => {
    saveResponderAlertSettings(alertSettings);
  }, [alertSettings]);

  return (
    <div className="page-stack">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">Settings</h1>
          <p className="text-sm text-muted-foreground">Manage responder alerts and quiet times.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Responder Alert Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={alertSettings.soundEnabled}
                onChange={(event) =>
                  setAlertSettings((prev) => ({
                    ...prev,
                    soundEnabled: event.target.checked,
                  }))
                }
              />
              Sound enabled
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={alertSettings.reducedAudio}
                onChange={(event) =>
                  setAlertSettings((prev) => ({
                    ...prev,
                    reducedAudio: event.target.checked,
                  }))
                }
              />
              Reduced audio
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={alertSettings.outsideInboxSound}
                onChange={(event) =>
                  setAlertSettings((prev) => ({
                    ...prev,
                    outsideInboxSound: event.target.checked,
                  }))
                }
              />
              Off-page chime
            </label>
            <label className="flex items-center gap-2">
              Profile
              <select
                className="h-8 rounded border border-input bg-background px-2"
                value={alertSettings.defaultProfile}
                onChange={(event) =>
                  setAlertSettings((prev) => ({
                    ...prev,
                    defaultProfile: event.target.value as AlertSoundProfile,
                  }))
                }
              >
                <option value="off">Off</option>
                <option value="subtle">Subtle</option>
                <option value="alert">Alert</option>
              </select>
            </label>
            <label className="flex items-center gap-2">
              Volume
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={alertSettings.volume}
                onChange={(event) =>
                  setAlertSettings((prev) => ({
                    ...prev,
                    volume: Number(event.target.value),
                  }))
                }
              />
            </label>
            <label className="flex items-center gap-2">
              Quiet start
              <input
                type="number"
                min={0}
                max={23}
                className="h-8 w-16 rounded border border-input bg-background px-2"
                value={alertSettings.quietHoursStart}
                onChange={(event) =>
                  setAlertSettings((prev) => ({
                    ...prev,
                    quietHoursStart: Math.min(23, Math.max(0, Number(event.target.value || 0))),
                  }))
                }
              />
            </label>
            <label className="flex items-center gap-2">
              Quiet end
              <input
                type="number"
                min={0}
                max={23}
                className="h-8 w-16 rounded border border-input bg-background px-2"
                value={alertSettings.quietHoursEnd}
                onChange={(event) =>
                  setAlertSettings((prev) => ({
                    ...prev,
                    quietHoursEnd: Math.min(23, Math.max(0, Number(event.target.value || 0))),
                  }))
                }
              />
            </label>
            <label className="flex items-center gap-2">
              SLA warn
              <input
                type="number"
                min={1}
                className="h-8 w-16 rounded border border-input bg-background px-2"
                value={alertSettings.slaWarningMinutes}
                onChange={(event) =>
                  setAlertSettings((prev) => ({
                    ...prev,
                    slaWarningMinutes: Math.max(1, Number(event.target.value || 1)),
                  }))
                }
              />
              m
            </label>
            <label className="flex items-center gap-2">
              SLA breach
              <input
                type="number"
                min={2}
                className="h-8 w-16 rounded border border-input bg-background px-2"
                value={alertSettings.slaBreachMinutes}
                onChange={(event) =>
                  setAlertSettings((prev) => ({
                    ...prev,
                    slaBreachMinutes: Math.max(2, Number(event.target.value || 2)),
                  }))
                }
              />
              m
            </label>
            <label className="flex items-center gap-2 sm:col-span-2">
              Agent
              <Input
                className="h-8 max-w-sm"
                value={alertSettings.currentAgent}
                onChange={(event) =>
                  setAlertSettings((prev) => ({
                    ...prev,
                    currentAgent: event.target.value,
                  }))
                }
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() =>
                playResponderAlertSound(alertSettings.defaultProfile, alertSettings, {
                  ignoreQuietHours: true,
                })
              }
            >
              Play Test Chime
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setAlertSettings(DEFAULT_RESPONDER_ALERT_SETTINGS);
                showToast({
                  tone: "info",
                  title: "Responder alerts reset",
                  description: "Default alert values restored.",
                  durationMs: 2000,
                });
              }}
            >
              Reset to Defaults
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
