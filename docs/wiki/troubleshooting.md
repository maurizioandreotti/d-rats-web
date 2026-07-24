# Troubleshooting

## No data from radio

1. Check DTR/RTS: the app logs `[RadioSerial] setSignals(DTR=1, RTS=1) OK` in console. If it fails, the USB dongle may not need DTR — connect should still work.
2. Verify DV Data TX = AUTO in radio menu
3. Power-cycle the radio after connecting USB — some ICOM radios need a cold start to enable the data port
4. Check the sniffer panel for RX packets. If only XOFF (0x13) and XON (0x11) bytes appear, the radio serial link is alive but no data frames are arriving.

## GPS positions not appearing

1. The transmitting station must have GPS enabled and GPS TX set to DV-G
2. GPS-A (DV-A) format is D-PRS — not currently parsed by the app
3. Raw `$$CRC` frames will appear in the sniffer as RX packets if they arrive

## Ping not getting response

1. The target station must be running D-RATS (or this web app) on their radio
2. D-RATS ping is an application-level protocol over DDT2 frames, not a radio feature
3. Verify the target radio is configured with DV Data TX = AUTO to pass DDT2 frames
