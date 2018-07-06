/**
 * Container for Dashboard Posts Section
 */
import React from 'react'
import PropTypes from 'prop-types'
import { Prompt } from 'react-router-dom'
import _ from 'lodash'
import {
  THREAD_MESSAGES_PAGE_SIZE,
  PROJECT_FEED_TYPE_PRIMARY,
  SCREEN_BREAKPOINT_MD,
  CODER_BOT_USER_FNAME,
  CODER_BOT_USER_LNAME,
} from '../../../config/constants'
import { connect } from 'react-redux'
import Sticky from 'react-stickynode'
import update from 'react-addons-update'
import NewPost from '../../../components/Feed/NewPost'

import { loadDashboardFeeds, createProjectTopic, saveProjectTopic, deleteProjectTopic, loadFeedComments, addFeedComment, saveFeedComment, deleteFeedComment, getFeedComment } from '../../actions/projectTopics'
import { toggleNotificationRead } from '../../../routes/notifications/actions'
import spinnerWhileLoading from '../../../components/LoadingSpinner'

import { filterReadNotifications, filterNotificationsByProjectId, filterTopicAndPostChangedNotifications } from '../../../routes/notifications/helpers/notifications'
import { REFRESH_UNREAD_UPDATE_INTERVAL } from '../../../config/constants'
import MediaQuery from 'react-responsive'
import ChatButton from '../../../components/ChatButton/ChatButton'
import NewPostMobile from '../../../components/Feed/NewPostMobile'
import ScrollableFeed from '../../../components/Feed/ScrollableFeed'
import Section from '../components/Section'
import SectionTitle from '../components/SectionTitle'
import Refresh from '../../../assets/icons/icon-refresh.svg'

import { scrollToHash } from '../../../components/ScrollToAnchors'
import { isSystemUser } from '../../../helpers/tcHelpers'

import './FeedContainer.scss'

const SYSTEM_USER = {
  firstName: CODER_BOT_USER_FNAME,
  lastName: CODER_BOT_USER_LNAME,
  photoURL: require('../../../assets/images/avatar-coder.svg')
}

class FeedView extends React.Component {

  constructor(props) {
    super(props)
    this.onNewPost = this.onNewPost.bind(this)
    this.onNewCommentChange = this.onNewCommentChange.bind(this)
    this.onShowAllComments = this.onShowAllComments.bind(this)
    this.onAddNewComment = this.onAddNewComment.bind(this)
    this.onLeave = this.onLeave.bind(this)
    this.isChanged = this.isChanged.bind(this)
    this.onNewPostChange = this.onNewPostChange.bind(this)
    this.onEditMessage = this.onEditMessage.bind(this)
    this.onSaveMessageChange = this.onSaveMessageChange.bind(this)
    this.onEditTopic = this.onEditTopic.bind(this)
    this.onTopicChange = this.onTopicChange.bind(this)
    this.onRefreshFeeds = this.onRefreshFeeds.bind(this)
    this.onScroll = this.onScroll.bind(this)
    this.toggleNewPostMobile = this.toggleNewPostMobile.bind(this)
    this.state = {
      feeds : [],
      showAll: [],
      newPost: {},
      unreadUpdate: [],
      scrolled: false,
      isNewPostMobileOpen: false
    }
  }

  componentDidMount() {
    window.addEventListener('beforeunload', this.onLeave)

    // after reload, mark all feed update notifications read
    this.setState({ unreadUpdate : []})
    const notReadNotifications = filterReadNotifications(this.props.notifications.notifications)
    const unreadTopicAndPostChangedNotifications = filterTopicAndPostChangedNotifications(filterNotificationsByProjectId(notReadNotifications, this.props.project.id))
    _.map(_.map(unreadTopicAndPostChangedNotifications, 'id' ), (notificationId) => {
      this.props.toggleNotificationRead(notificationId)
    })

    this.refreshUnreadUpdate = setInterval(() => {
      const notReadNotifications = filterReadNotifications(this.props.notifications.notifications)
      const unreadTopicAndPostChangedNotifications = filterTopicAndPostChangedNotifications(filterNotificationsByProjectId(notReadNotifications, this.props.project.id))
      this.setState({ unreadUpdate: _.map(unreadTopicAndPostChangedNotifications, 'id' ) })
      if (!this.isChanged() && !this.state.scrolled && this.state.unreadUpdate.length > 0) {
        this.onRefreshFeeds()
      }
    }, REFRESH_UNREAD_UPDATE_INTERVAL)
  }

  componentWillMount() {
    this.init(this.props)
    window.addEventListener('scroll', this.onScroll)
  }

  componentWillReceiveProps(nextProps) {
    this.init(nextProps, this.props)
  }

  componentWillUnmount() {
    window.removeEventListener('beforeunload', this.onLeave)
    window.removeEventListener('scroll', this.onScroll)
    clearInterval(this.refreshUnreadUpdate)
  }

  // Notify user if they navigate away while the form is modified.
  onLeave(e = {}) {
    if (this.isChanged()) {
      return e.returnValue = 'You haven\'t posted your message. If you leave this page, your message will not be saved. Are you sure you want to leave?'
    }
  }

  toggleNewPostMobile() {
    this.setState({ isNewPostMobileOpen: !this.state.isNewPostMobileOpen })
  }

  isChanged() {
    const { newPost } = this.state
    const hasComment = !_.isUndefined(_.find(this.state.feeds, (feed) => (feed.isSavingTopic || feed.isDeletingTopic || feed.isAddingComment)
      || (feed.newComment && feed.newComment.length)
      || (feed.newTitle && feed.newTitle.length && feed.newTitle !== feed.title)
      || (feed.topicMessage && feed.topicMessage.newContent && feed.topicMessage.newContent.length && feed.topicMessage.rawContent && feed.topicMessage.newContent !== feed.topicMessage.rawContent)
      || !_.isUndefined(_.find(feed.comments, (message) => message.isSavingComment || message.isDeletingComment || (message.newContent && message.newContent.length && message.rawContent && message.newContent !== message.rawContent)))
    ))
    const hasThread = (newPost.title && !!newPost.title.trim().length) || ( newPost.content && !!newPost.content.trim().length)
    return hasThread || hasComment
  }

  mapFeed(feed, showAll = false, resetNewComment = false, prevProps) {
    const { allMembers, project, currentMemberRole } = this.props
    const item = _.pick(feed, ['id', 'date', 'read', 'tag', 'title', 'totalPosts', 'userId', 'reference', 'referenceId', 'postIds', 'isSavingTopic', 'isDeletingTopic', 'isAddingComment', 'isLoadingComments', 'error'])
    // Github issue##623, allow comments on all posts (including system posts)
    item.allowComments = true
    if (isSystemUser(item.userId)) {
      item.user = SYSTEM_USER
    } else {
      item.user = allMembers[item.userId]
    }
    item.unread = !feed.read && !!currentMemberRole
    item.totalComments = feed.totalPosts
    item.comments = []
    let prevFeed = null
    if (prevProps) {
      prevFeed = _.find(prevProps.feeds, t => feed.id === t.id)
    }
    const _toComment = (p) => {
      const date = p.updatedDate?p.updatedDate:p.date
      const edited = date !== p.date
      const comment = {
        id: p.id,
        content: p.body,
        rawContent: p.rawContent,
        isGettingComment: p.isGettingComment,
        isSavingComment: p.isSavingComment,
        isDeletingComment: p.isDeletingComment,
        error: p.error,
        unread: !p.read && !!currentMemberRole,
        date,
        createdAt: p.date,
        edited,
        author: isSystemUser(p.userId) ? SYSTEM_USER : allMembers[p.userId]
      }
      const prevComment = prevFeed ? _.find(prevFeed.posts, t => p.id === t.id) : null
      if (prevComment && prevComment.isSavingComment && !comment.isSavingComment && !comment.error) {
        comment.editMode = false
      } else {
        const feedFromState = _.find(this.state.feeds, t => feed.id === t.id)
        const commentFromState = feedFromState ? _.find(feedFromState.comments, t => comment.id === t.id) : null
        comment.newContent = commentFromState ? commentFromState.newContent : null
        comment.editMode = commentFromState && commentFromState.editMode
      }
      return comment
    }
    item.topicMessage = _toComment(feed.posts[0])
    if (prevFeed && prevFeed.isSavingTopic && !feed.isSavingTopic && !feed.error) {
      item.editTopicMode = false
    } else {
      const feedFromState = _.find(this.state.feeds, t => feed.id === t.id)
      item.newTitle = feedFromState ? feedFromState.newTitle : null
      item.topicMessage.newContent = feedFromState ? feedFromState.topicMessage.newContent : null
      item.editTopicMode = feedFromState && feedFromState.editTopicMode
    }

    const validPost = (post) => {
      return post.type === 'post' && (post.body && post.body.trim().length || !isSystemUser(post.userId))
    }
    if (showAll) {
      // if we are showing all comments, just iterate through the entire array
      _.forEach(feed.posts, p => {
        validPost(p) ? item.comments.push(_toComment(p)) : item.totalComments--
      })
    } else {
      // otherwise iterate from right and add to the beginning of the array
      _.forEachRight(feed.posts, (p) => {
        validPost(p) ? item.comments.unshift(_toComment(p)) : item.totalComments--
        if (!feed.showAll && item.comments.length === THREAD_MESSAGES_PAGE_SIZE)
          return false
      })
    }
    item.newComment = ''
    if (!resetNewComment) {
      const feedFromState = _.find(this.state.feeds, f => feed.id === f.id)
      item.newComment = feedFromState ? feedFromState.newComment : ''
    }
    item.hasMoreComments = item.comments.length !== item.totalComments
    // adds permalink for the feed
    // item.permalink = `/projects/${project.id}/status/${item.id}`
    item.permalink = `/projects/${project.id}#feed-${item.id}`
    return item
  }

  init(props, prevProps) {
    const { feeds } = props
    let resetNewPost = false
    if (prevProps) {
      resetNewPost = prevProps.isCreatingFeed && !props.isCreatingFeed && !props.error
    }
    this.setState({
      newPost: resetNewPost ? {} : this.state.newPost,
      scrolled: window.scrollY>0,
      feeds: feeds.map((feed) => {
        // finds the same feed from previous props, if exists
        let prevFeed
        if (prevProps && prevProps.feeds) {
          prevFeed = _.find(prevProps.feeds, f => feed.id === f.id)
        }
        // reset new comment if we were adding comment and there is no error in doing so
        const resetNewComment = prevFeed && prevFeed.isAddingComment && !feed.isAddingComment && !feed.error
        return this.mapFeed(feed, this.state.showAll.indexOf(feed.id) > -1, resetNewComment, prevProps)
      }).filter(item => item)
    }, () => {
      if (prevProps) {
        // only scroll at first time
        return
      }
      const scrollTo = window.location.hash ? window.location.hash.substring(1) : null
      if (scrollTo) {
        scrollToHash(scrollTo)
      }
    })
  }

  onNewPostChange(title, content) {
    this.setState({
      newPost: {title, content}
    })
  }

  onNewPost({title, content}) {
    const { project } = this.props
    const newFeed = {
      title,
      body: content,
      tag: PROJECT_FEED_TYPE_PRIMARY
    }
    this.props.createProjectTopic(project.id, newFeed)
  }

  onNewCommentChange(feedId, content) {
    this.setState({
      feeds: this.state.feeds.map((item) => {
        if (item.id === feedId) {
          return {...item, newComment: content}
        }
        return item
      })
    })
  }

  onShowAllComments(feedId) {
    const { feeds } = this.props
    const feed = _.find(feeds, feed => feed.id === feedId)
    const stateFeedIdx = _.findIndex(this.state.feeds, (f) => f.id === feedId)
    // in case we have already have all comments for that feed from the server,
    // just change the state to show all comments for that FeedId.
    // Otherwise load more comments from the server
    if (feed.posts.length < feed.postIds.length) {
      // load more from server
      const updatedFeed = update(this.state.feeds[stateFeedIdx], {
        isLoadingComments: { $set : true }
      })
      const retrievedPostIds = _.map(feed.posts, 'id')
      const commentIdsToRetrieve = _.filter(feed.postIds, _id => retrievedPostIds.indexOf(_id) === -1 )
      this.setState(update(this.state, {
        showAll: { $push: [feedId] },
        feeds: { $splice: [[stateFeedIdx, 1, updatedFeed ]] }
      }))
      this.props.loadFeedComments(feedId, PROJECT_FEED_TYPE_PRIMARY, commentIdsToRetrieve)
    } else {
      this.setState(update(this.state, {
        showAll: { $push: [feedId] },
        feeds: { $splice: [[stateFeedIdx, 1, this.mapFeed(feed, true) ]] }
      }))
    }
  }

  onAddNewComment(feedId, content) {
    const { currentUser } = this.props
    const newComment = {
      date: new Date(),
      userId: parseInt(currentUser.id),
      content
    }
    this.props.addFeedComment(feedId, PROJECT_FEED_TYPE_PRIMARY, newComment)
  }

  onSaveMessageChange(feedId, messageId, content, editMode) {
    this.setState({
      feeds: this.state.feeds.map((item) => {
        if (item.id === feedId) {
          const messageIndex = _.findIndex(item.comments, message => message.id === messageId)
          const message = item.comments[messageIndex]
          message.newContent = content
          message.editMode = editMode
          item.comments[messageIndex] = {...message}
          item.comments = _.map(item.comments, message => message)
          return {...item}
        }
        return item
      })
    })
  }

  onSaveMessage(feedId, message, content) {
    const newMessage = {...message}
    newMessage.content = content
    this.props.saveFeedComment(feedId, PROJECT_FEED_TYPE_PRIMARY, newMessage)
  }

  onDeleteMessage(feedId, postId) {
    this.props.deleteFeedComment(feedId, PROJECT_FEED_TYPE_PRIMARY, postId)
  }

  onEditMessage(feedId, postId) {
    const thread = _.find(this.state.feeds, t => feedId === t.id)
    const comment = _.find(thread.comments, message => message.id === postId)
    if (!comment.rawContent) {
      this.props.getFeedComment(feedId, PROJECT_FEED_TYPE_PRIMARY, postId)
    }
    this.onSaveMessageChange(feedId, postId, null, true)
  }

  onEditTopic(feedId) {
    const thread = _.find(this.state.feeds, t => feedId === t.id)
    const comment = thread.topicMessage
    if (!comment.rawContent) {
      this.props.getFeedComment(feedId, PROJECT_FEED_TYPE_PRIMARY, comment.id)
    }
    this.onTopicChange(feedId, comment.id, null, null, true)
  }

  onTopicChange(feedId, messageId, title, content, editTopicMode) {
    this.setState({
      feeds: this.state.feeds.map((item) => {
        if (item.id === feedId) {
          item.newTitle = title
          item.editTopicMode = editTopicMode
          item.topicMessage = {...item.topicMessage, newContent: content}
          return {...item}
        }
        return item
      })
    })
  }

  onSaveTopic(feedId, postId, title, content) {
    this.props.saveProjectTopic(feedId, PROJECT_FEED_TYPE_PRIMARY, {postId, title, content})
  }

  onDeleteTopic(feedId) {
    this.props.deleteProjectTopic(feedId, PROJECT_FEED_TYPE_PRIMARY)
  }

  onRefreshFeeds() {
    this.props.loadDashboardFeeds(this.props.project.id)
  }

  onScroll() {
    const { scrolled: currentlyScrolled } = this.state
    const scrolled = window.scrollY > 0

    // update state only if the values is changes to avoid unnecessary redraws
    if (currentlyScrolled !== scrolled) {
      this.setState({ scrolled })
    }
  }

  render () {
    const {currentUser, currentMemberRole, isCreatingFeed, error, allMembers } = this.props
    const { feeds, unreadUpdate, scrolled, isNewPostMobileOpen } = this.state
    const onLeaveMessage = this.onLeave() || ''

    return (
      <div>
        { unreadUpdate.length > 0 && !this.isChanged() && scrolled &&
          <Sticky top={80} innerZ={999}>
            <div className="prompt">
              <Refresh className="icon-refresh" width="20" style={{position: 'absolute', top: '4px'}}/>
              <button className="tc-btn tc-btn-primary tc-btn-md" style={{borderRadius: '20px', marginLeft: '-15px'}} onClick={this.onRefreshFeeds}>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Reload page to view updates</button>
            </div>
          </Sticky>
        }

        <Prompt
          when={!!onLeaveMessage}
          message={onLeaveMessage}
        />

        <Section>
          <SectionTitle title="Posts" />
          <div>
            <MediaQuery minWidth={SCREEN_BREAKPOINT_MD}>
              <NewPost
                currentUser={currentUser}
                allMembers={allMembers}
                onPost={this.onNewPost}
                isCreating={isCreatingFeed}
                hasError={error}
                heading="NEW STATUS POST"
                onNewPostChange={this.onNewPostChange}
                titlePlaceholder="Share the latest project updates with the team"
              />
            </MediaQuery>
            {feeds.map((feed) => (
              <div styleName="feed-card" key={feed.id.toString()}>
                <ScrollableFeed
                  {...{
                    ...feed,
                    id: feed.id.toString(),
                    allowComments: feed.allowComments && !!currentMemberRole,
                    currentUser,
                    allMembers,
                    onNewCommentChange: this.onNewCommentChange.bind(this, feed.id),
                    onAddNewComment: this.onAddNewComment.bind(this, feed.id),
                    onLoadMoreComments: this.onShowAllComments.bind(this, feed.id),
                    onEditMessage: this.onEditMessage.bind(this, feed.id),
                    onSaveMessageChange: this.onSaveMessageChange.bind(this, feed.id),
                    onSaveMessage: this.onSaveMessage.bind(this, feed.id),
                    onDeleteMessage: this.onDeleteMessage.bind(this, feed.id),
                    onEditTopic: this.onEditTopic.bind(this, feed.id),
                    onTopicChange: this.onTopicChange.bind(this, feed.id),
                    onSaveTopic: this.onSaveTopic.bind(this, feed.id),
                    onDeleteTopic: this.onDeleteTopic.bind(this, feed.id),
                  }}
                />
              </div>
            ))}
          </div>
        </Section>
        { !isNewPostMobileOpen &&
          <MediaQuery maxWidth={SCREEN_BREAKPOINT_MD - 1}>
            <div styleName="chat-button-space">
              <ChatButton onClick={this.toggleNewPostMobile} />
            </div>
          </MediaQuery>
        }
        { isNewPostMobileOpen &&
          <NewPostMobile
            statusTitle="NEW STATUS"
            commentTitle="WRITE POST"
            statusPlaceholder="Share the latest project updates with the team"
            commentPlaceholder="Write your post about the status here"
            submitText="Post"
            nextStepText="Add post"
            onClose={this.toggleNewPostMobile}
            allMembers={allMembers}
            currentUser={currentUser}
            onPost={this.onNewPost}
            isCreating={isCreatingFeed}
            hasError={error}
            onNewPostChange={this.onNewPostChange}
          />
        }
      </div>
    )
  }
}
const enhance = spinnerWhileLoading(props => !props.isLoading)
const EnhancedFeedView = enhance(FeedView)

class FeedContainer extends React.Component {
  constructor(props) {
    super(props)
  }

  componentWillMount() {
    this.props.loadDashboardFeeds(this.props.project.id)
  }

  render() {
    return <EnhancedFeedView {...this.props} />
  }
}

FeedContainer.PropTypes = {
  currentMemberRole: PropTypes.string,
  project: PropTypes.object.isRequired
}

const mapStateToProps = ({ projectTopics, members, loadUser, notifications }) => {
  return {
    currentUser    : loadUser.user,
    feeds          : projectTopics.feeds[PROJECT_FEED_TYPE_PRIMARY].topics,
    feedTotalCount : projectTopics.feeds[PROJECT_FEED_TYPE_PRIMARY].totalCount,
    isLoading      : projectTopics.isLoading,
    isCreatingFeed : projectTopics.isCreatingFeed,
    error          : projectTopics.error,
    allMembers     : members.members,
    notifications,
  }
}
const mapDispatchToProps = {
  loadDashboardFeeds,
  createProjectTopic,
  saveProjectTopic,
  deleteProjectTopic,
  loadFeedComments,
  addFeedComment,
  saveFeedComment,
  deleteFeedComment,
  getFeedComment,
  toggleNotificationRead,
}

export default connect(mapStateToProps, mapDispatchToProps)(FeedContainer)
