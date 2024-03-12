import {
  CLOSE_INITIATED_BY_BUTTON,
  CLOSE_INITIATED_BY_ESC,
} from "discourse/components/d-modal";
import { apiInitializer } from "discourse/lib/api";
import { BookmarkFormData } from "discourse/lib/bookmark";
import Bookmark from "discourse/models/bookmark";
import BookmarkRedesignModal from "../components/modal/bookmark-redesign";

export default apiInitializer("0.11.1", (api) => {
  const modalService = api.container.lookup("service:modal");

  api.addPostMenuButton("coffee", () => {
    return {
      action: "openRedesignedBookmarkModal",
      icon: "adjust",
      className: "open-redesigned-bookmark-modal",
      title: "post.bookmark",
      position: "last",
    };
  });

  api.attachWidgetAction("post", "openRedesignedBookmarkModal", function () {
    const post = this.model;
    const bookmarkForPost = post.topic.bookmarks.find(
      (bookmark) =>
        bookmark.bookmarkable_id === post.id &&
        bookmark.bookmarkable_type === "Post"
    );
    _modifyPostBookmark(
      modalService,
      bookmarkForPost || Bookmark.createFor(this.currentUser, "Post", post.id),
      post
    );
  });
});

function _modifyPostBookmark(modalService, bookmark, post) {
  modalService
    .show(BookmarkRedesignModal, {
      model: {
        bookmark: new BookmarkFormData(bookmark),
        context: post,
        afterSave: (savedData) => {
          this._syncBookmarks(savedData);
          this.model.set("bookmarking", false);
          post.createBookmark(savedData);
          this.model.afterPostBookmarked(post, savedData);
          return [post.id];
        },
        afterDelete: (topicBookmarked, bookmarkId) => {
          this.model.removeBookmark(bookmarkId);
          post.deleteBookmark(topicBookmarked);
        },
      },
    })
    .then((closeData) => {
      if (!closeData) {
        return;
      }

      if (
        closeData.closeWithoutSaving ||
        closeData.initiatedBy === CLOSE_INITIATED_BY_ESC ||
        closeData.initiatedBy === CLOSE_INITIATED_BY_BUTTON
      ) {
        post.appEvents.trigger("post-stream:refresh", {
          id: bookmark.bookmarkable_id,
        });
      }
    });
}
