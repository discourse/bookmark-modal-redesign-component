import Component from "@glimmer/component";
import { tracked } from "@glimmer/tracking";
import { action } from "@ember/object";
import { and, notEmpty } from "@ember/object/computed";
import { service } from "@ember/service";
import { CLOSE_INITIATED_BY_CLICK_OUTSIDE } from "discourse/components/d-modal";
import { ajax } from "discourse/lib/ajax";
import { extractError } from "discourse/lib/ajax-error";
import { sanitize } from "discourse/lib/text";
import { now, parseCustomDatetime } from "discourse/lib/time-utils";
import { AUTO_DELETE_PREFERENCES } from "discourse/models/bookmark";
import discourseLater from "discourse-common/lib/later";
import I18n from "I18n";

export default class BookmarkRedesignModal extends Component {
  @service dialog;
  @service currentUser;
  @service site;

  @tracked postDetectedLocalDate = null;
  @tracked postDetectedLocalTime = null;
  @tracked postDetectedLocalTimezone = null;
  @tracked prefilledDatetime = null;
  @tracked flash = null;
  @tracked userTimezone = this.currentUser.user_option.timezone;
  @tracked showOptions = this.args.model.bookmark.id ? true : false;
  @tracked reminderDate = null;
  @tracked reminderTime = null;

  @notEmpty("userTimezone") userHasTimezoneSet;

  @notEmpty("bookmark.id") editingExistingBookmark;

  @and("bookmark.id", "bookmark.reminderAt") existingBookmarkHasReminder;

  @tracked _closeWithoutSaving = false;
  @tracked _savingBookmarkManually = false;
  @tracked _saving = false;
  @tracked _deleting = false;

  get minDate() {
    return now(this.currentUser.user_option.timezone).toDate();
  }

  get bookmark() {
    return this.args.model.bookmark;
  }

  get modalTitle() {
    return I18n.t(this.bookmark.id ? "bookmarks.edit" : "bookmarks.create");
  }

  get bookmarkAfterNotificationModes() {
    return Object.keys(AUTO_DELETE_PREFERENCES).map((key) => {
      return {
        value: AUTO_DELETE_PREFERENCES[key],
        name: I18n.t(`bookmarks.auto_delete_preference.${key.toLowerCase()}`),
      };
    });
  }

  @action
  didInsert() {
    discourseLater(() => {
      if (this.site.isMobileDevice) {
        document.getElementById("bookmark-name").blur();
      }
    });

    this.#initializeExistingBookmarkData();
  }

  @action
  closingModal(closeModalArgs) {
    // If the user clicks outside the modal we save automatically for them,
    // as long as they are not already saving manually or deleting the bookmark.
    if (
      closeModalArgs.initiatedBy === CLOSE_INITIATED_BY_CLICK_OUTSIDE &&
      !this._closeWithoutSaving &&
      !this._savingBookmarkManually
    ) {
      this.#saveBookmark()
        .catch((e) => this.#handleSaveError(e))
        .then(() => {
          this.args.closeModal(closeModalArgs);
        });
    } else {
      this.args.closeModal(closeModalArgs);
    }
  }

  @action
  closeWithoutSavingBookmark() {
    this._closeWithoutSaving = true;
    this.args.closeModal({ closeWithoutSaving: this._closeWithoutSaving });
  }

  @action
  saveAndClose() {
    this.flash = null;
    if (this._saving || this._deleting) {
      return;
    }

    this._saving = true;
    this._savingBookmarkManually = true;
    return this.#saveBookmark()
      .then(() => this.args.closeModal())
      .catch((error) => this.#handleSaveError(error))
      .finally(() => {
        this._saving = false;
      });
  }

  @action
  changeSelectedDate(date) {
    this.reminderDate = date;
  }

  @action
  changeSelectedTime(time) {
    this.reminderTime = time;
  }

  #saveBookmark() {
    if (this.editingExistingBookmark) {
      return ajax(`/bookmarks/${this.bookmark.id}`, {
        type: "PUT",
        data: this.bookmark.saveData,
      }).then(() => {
        this.args.model.afterSave?.(this.bookmark.saveData);
      });
    } else {
      return ajax("/bookmarks", {
        type: "POST",
        data: this.bookmark.saveData,
      }).then((response) => {
        this.bookmark.id = response.id;
        this.args.model.afterSave?.(this.bookmark.saveData);
      });
    }
  }

  #handleSaveError(error) {
    this._savingBookmarkManually = false;
    if (typeof error === "string") {
      this.flash = sanitize(error);
    } else {
      this.flash = sanitize(extractError(error));
    }
  }

  #initializeExistingBookmarkData() {
    if (!this.existingBookmarkHasReminder || !this.editingExistingBookmark) {
      return;
    }

    this.prefilledDatetime = this.bookmark.reminderAt;
    this.bookmark.selectedDatetime = parseCustomDatetime(
      this.prefilledDatetime,
      null,
      this.userTimezone
    );
  }
}
