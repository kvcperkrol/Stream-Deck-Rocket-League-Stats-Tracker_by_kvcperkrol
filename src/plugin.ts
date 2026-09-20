import streamDeck, { action, SingletonAction, type DidReceiveSettingsEvent, type WillAppearEvent, type WillDisappearEvent } from "@elgato/streamdeck";
import { Hub, type KeySettings } from "./hub";
import { ROLES, type Role } from "./ui/context";
import { actionUuid, LEGACY_ACTIONS, legacyUuid } from "./ui/layout";

const hub = new Hub(streamDeck.logger.createScope("Hub"));

/** One class per key role; the role decides what is drawn, everything else is shared through the hub. */
abstract class RoleAction extends SingletonAction<KeySettings> {
	abstract readonly role: Role;

	override onWillAppear(ev: WillAppearEvent<KeySettings>): void {
		if (ev.action.isKey()) hub.register(ev.action, this.role, ev.payload.settings);
	}

	override onWillDisappear(ev: WillDisappearEvent<KeySettings>): void {
		hub.unregister(ev.action.id);
	}

	override onDidReceiveSettings(ev: DidReceiveSettingsEvent<KeySettings>): void {
		hub.updateSettings(ev.action.id, ev.payload.settings);
	}
}

/** Registers one action id so that it draws `role`. Keys only display data; pressing them does nothing. */
function registerRole(uuid: string, role: Role): void {
	const Registered = action({ UUID: uuid })(
		class extends RoleAction {
			override readonly role: Role = role;
		},
		undefined as never, // the decorator ignores its context argument; it is only a class wrapper
	);
	streamDeck.actions.registerAction(new Registered());
}

for (const role of ROLES) registerRole(actionUuid(role), role);
// Ids of removed keys stay alive (hidden in the actions list) so a deck that still has them keeps working.
for (const [id, role] of Object.entries(LEGACY_ACTIONS)) registerRole(legacyUuid(id), role);

streamDeck.ui.onSendToPlugin((ev) => hub.handleUiMessage(ev.payload));

void streamDeck.connect().then(() => hub.start());

process.on("uncaughtException", (e) => streamDeck.logger.error(`uncaught: ${e?.stack ?? e}`));
process.on("unhandledRejection", (e) => streamDeck.logger.error(`unhandled: ${e}`));
